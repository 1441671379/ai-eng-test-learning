"""Live experimental pipeline sharing the application's existing speech models."""
import json
import logging
import threading
import time

import numpy as np
from ctc_word_alignment import EnglishWordTimer

from phoneme_scorer import _load_audio,_phonemize_target_phrase
from phone_alignment import decode_phone_evidence
from time_word_alignment import align_time_first,normalize_windows,visible_words,VERSION
from pronunciation_reference import word_reference

def decode_timed(ids,probabilities,id_to_token,blank_id,stride,receptive,duration):
    if len(ids)!=len(probabilities): raise ValueError("Inconsistent decoder frames")
    result=[]; begin=0
    while begin<len(ids):
        end=begin+1
        while end<len(ids) and ids[end]==ids[begin]: end+=1
        token=id_to_token.get(ids[begin],"")
        if ids[begin]!=blank_id and token and not token.startswith("<") and token!="|":
            peak=max(range(begin,end),key=lambda i:probabilities[i])
            for phone in token.split():
                result.append({"token":phone,"confidence":sum(probabilities[begin:end])/(end-begin),
                               "frameStart":begin,"frameEnd":end,
                               "peakSec":min((peak*stride+receptive/2)/16000,duration)})
        begin=end
    baseline=decode_phone_evidence(ids,id_to_token,blank_id,probabilities)
    assert [(v["token"],v["confidence"]) for v in result]==[(v["token"],v["confidence"]) for v in baseline]
    return result


class TimeFirstService:
    def __init__(self,scorer,transcriber,word_timer=None):
        self.scorer,self.transcriber=scorer,transcriber
        self.word_timer=word_timer or EnglishWordTimer()
        self.lock=threading.Lock()
        self.last_success=None

    def status(self):
        timing=self.word_timer.status()
        return {"version":VERSION,"configured":timing["configured"],"timingReady":timing["ready"],
                "timingProvider":timing["provider"],"phonemeReady":self.scorer.model_loaded,
                "transcriberReady":self.transcriber.model_loaded,"lastSuccessfulAlignment":self.last_success,
                "busy":self.lock.locked(),"error":timing["error"]}

    def _phones(self,waveform):
        import torch
        self.scorer.warmup()
        if not self.scorer.model_loaded: raise RuntimeError(self.scorer.load_error or "音素模型尚未就绪。")
        model=self.scorer.model
        inputs=self.scorer.feature_extractor(waveform,sampling_rate=16000,return_tensors="pt",padding="longest")
        mask=inputs.attention_mask.to(self.scorer.device) if hasattr(inputs,"attention_mask") and inputs.attention_mask is not None else None
        with torch.no_grad(): logits=model(inputs.input_values.to(self.scorer.device),attention_mask=mask).logits
        probabilities,ids=torch.softmax(logits.float(),dim=-1).max(dim=-1)
        stride,receptive=1,1
        for kernel,step in zip(model.config.conv_kernel,model.config.conv_stride):
            receptive+=(kernel-1)*stride; stride*=step
        evidence=decode_timed(ids[0].tolist(),probabilities[0].tolist(),self.scorer.id_to_token,self.scorer.blank_id,
                              stride,receptive,len(waveform)/16000)
        return evidence

    def _windows(self,waveform,text):
        return self.word_timer.align(waveform,text)

    def analyze(self,audio_bytes,target_text,spoken_text="",filename=None):
        if not self.lock.acquire(blocking=False): raise RuntimeError("另一段时间配对实验正在运行，请稍后重试。")
        try:
            start=time.perf_counter()
            target_words=visible_words(target_text)
            if not target_words or len(target_text)>600 or len(target_words)>70:
                raise ValueError("请输入不超过 600 个字符、70 个单词的英文目标句子。")
            profile={}; mark=time.perf_counter()
            waveform=_load_audio(audio_bytes,filename=filename)
            profile["audioDecodeSeconds"]=time.perf_counter()-mark
            duration=len(waveform)/16000
            if not .2<=duration<=30 or not np.isfinite(waveform).all(): raise ValueError("请使用 0.2–30 秒的有效录音。")
            if float(np.max(np.abs(waveform)))<.0001: raise ValueError("录音接近静音，请检查麦克风后重录。")
            supplied=bool(spoken_text.strip())
            mark=time.perf_counter()
            if not supplied: spoken_text=self.transcriber.transcribe(audio_bytes,filename=filename)["transcript"]
            profile["transcriptionSeconds"]=time.perf_counter()-mark
            actual_words=visible_words(spoken_text)
            if not actual_words or len(actual_words)>70 or len(spoken_text)>600:
                raise ValueError("未识别到有效英文，或实际说出的文字过长。请修改文字或重录。")
            mark=time.perf_counter()
            target=_phonemize_target_phrase(" ".join(target_words))
            phones=target["ipa"].split()
            british=_phonemize_target_phrase(" ".join(target_words),language="en-gb")
            british_phones=british["ipa"].split()
            pronunciations=[word_reference(s["text"],tuple(phones[s["start"]:s["end"]]),
                                           tuple(british_phones[b["start"]:b["end"]]))
                            for s,b in zip(target["segments"],british["segments"],strict=True)]
            profile["targetPhonemizeSeconds"]=time.perf_counter()-mark; mark=time.perf_counter()
            evidence=self._phones(waveform)
            profile["phoneRecognitionSeconds"]=time.perf_counter()-mark; mark=time.perf_counter()
            timing=self._windows(waveform," ".join(actual_words))
            profile["wordTimingSeconds"]=time.perf_counter()-mark; mark=time.perf_counter()
            windows=normalize_windows(timing["aligned"],[s["text"] for s in target["segments"]],actual_words,duration)
            heard=[v["token"] for v in evidence]
            methods={mode:align_time_first(phones,heard,target["segments"],evidence,windows,mode=mode,
                                          pronunciations=pronunciations,allow_partial=True) for mode in ("soft","hard")}
            profile["groupingSeconds"]=time.perf_counter()-mark
            logging.getLogger(__name__).info("Time-first processing profile duration=%.3f supplied=%s stages=%s",duration,supplied,json.dumps(profile))
            self.last_success=time.time()
            return {"version":VERSION,"targetText":target_text,"transcript":spoken_text,"transcriptSource":"provided" if supplied else "whisper",
                    "duration":duration,"methods":methods,"evidence":evidence,"windows":windows,
                    "targetSource":target.get("targetSource","phonemizer"),"elapsedSeconds":time.perf_counter()-start,"profile":profile,
                    "timing":{"version":timing["version"],"model":timing["model"],"device":timing["device"],
                              "alignmentSeconds":timing["alignmentSeconds"],"modelLoadSeconds":timing["modelLoadSeconds"]},
                    "phonemeModel":self.scorer.model_name,"phonemeModelRevision":self.scorer.model_revision,
                    "experimental":True}
        finally: self.lock.release()
