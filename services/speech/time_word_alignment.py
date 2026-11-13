"""Experimental time-first word grouping, shared by offline and live callers.

No models, annotations or application databases are imported here. Each heard
phone is consumed once. Time eligibility precedes phonetic optimization.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
import math
import re

from phone_alignment import LOW_DECODER_CONFIDENCE, phone_cost, word_owners

VERSION = "time-first-lexical-partial-v2"
BOUNDARY_TOLERANCE = .100  # Frozen before running this strategy on cached outcomes.


def visible_words(text):
    return re.findall(r"[A-Za-z]+(?:['’][A-Za-z]+)*", text)


def word_mapping(target_words, spoken_words):
    a, b = [w.lower() for w in target_words], [w.lower() for w in spoken_words]
    n, m = len(a), len(b)
    f, r = [[0]*(m+1) for _ in range(n+1)], [[0]*(m+1) for _ in range(n+1)]
    for i in range(n+1):
        f[i][0], r[i][m] = i, n-i
    for j in range(m+1):
        f[0][j], r[n][j] = j, m-j
    for i in range(1,n+1):
        for j in range(1,m+1):
            f[i][j] = min(f[i-1][j]+1,f[i][j-1]+1,f[i-1][j-1]+(a[i-1]!=b[j-1]))
    for i in range(n-1,-1,-1):
        for j in range(m-1,-1,-1):
            r[i][j] = min(r[i+1][j]+1,r[i][j+1]+1,r[i+1][j+1]+(a[i]!=b[j]))
    result=[]
    for j in range(m):
        owners={i for i in range(n) if f[i][j]+(a[i]!=b[j])+r[i+1][j+1]==f[n][m]}
        if any(f[i][j]+1+r[i][j+1]==f[n][m] for i in range(n+1)):
            owners.add(None)
        result.append(sorted(owners,key=lambda v:-1 if v is None else v))
    return result


def normalize_windows(aligned, target_words, spoken_words, duration):
    words=[w for s in aligned.get("segments",[]) for w in s.get("words",[])]
    chars=[c for s in aligned.get("segments",[]) for c in (s.get("chars") or [])]
    mapping=word_mapping(target_words,spoken_words)
    result=[]
    for j,w in enumerate(words):
        start,end,score=(w.get(k) for k in ("start","end","score"))
        valid=all(isinstance(v,(int,float)) and math.isfinite(v) for v in (start,end,score))
        valid=valid and 0<=start<end<=duration+.025
        real_chars=[c for c in chars if c.get("char","").strip()
                    and all(isinstance(c.get(k),(int,float)) and math.isfinite(c[k]) for k in ("start","end","score"))
                    and valid and start-.002<=c["start"]<=c["end"]<=end+.002]
        same=j<len(spoken_words) and str(w.get("word","")).strip(".,!?;:").lower()==spoken_words[j].lower()
        owners=mapping[j] if j<len(mapping) else []
        timing=bool(valid and real_chars and same and len(words)==len(spoken_words))
        result.append({"word":w.get("word"),"spokenIndex":j,"owners":owners,"start":start,"end":end,
                       "score":score,"timingTrusted":timing,"trusted":timing and len(owners)==1,
                       "estimated":not bool(real_chars)})
    return result


@dataclass
class Local:
    cost: int
    minimum_errors: int
    maximum_errors: int
    operations: list
    target: list | None = None


def _local(target, heard, evidence, word, previous="", following=""):
    """All minimum-edit paths: word verdict and exact-phone certainty differ."""
    n,m=len(target),len(heard)
    def edit(i,j):
        return phone_cost(target[i],heard[j],word,target[i-1] if i else previous,
                          target[i+1] if i+1<n else following)
    def reliable(j):
        return evidence[j].get("confidence",0)>=LOW_DECODER_CONFIDENCE
    f=[[0]*(m+1) for _ in range(n+1)]
    lo=[[0]*(m+1) for _ in range(n+1)]
    hi=[[0]*(m+1) for _ in range(n+1)]
    for i in range(n+1): f[i][0]=i*4
    for j in range(m+1):
        f[0][j]=j*4
        lo[0][j]=hi[0][j]=sum(reliable(k) for k in range(j))
    for i in range(1,n+1):
        # No decoded sound in a word is insufficient acoustic evidence to
        # accuse the learner of deleting it. Other nonempty paths can delete.
        lo[i][0]=hi[i][0]=i if m else 0
        for j in range(1,m+1):
            c=edit(i-1,j-1)
            choices=[(f[i-1][j]+4,lo[i-1][j]+1,hi[i-1][j]+1),
                     (f[i][j-1]+4,lo[i][j-1]+reliable(j-1),hi[i][j-1]+reliable(j-1)),
                     (f[i-1][j-1]+c,lo[i-1][j-1]+(c==4 and reliable(j-1)),hi[i-1][j-1]+(c==4 and reliable(j-1)))]
            f[i][j]=min(v[0] for v in choices)
            optimal=[v for v in choices if v[0]==f[i][j]]
            lo[i][j],hi[i][j]=min(v[1] for v in optimal),max(v[2] for v in optimal)
    r=[[0]*(m+1) for _ in range(n+1)]
    for i in range(n+1): r[i][m]=(n-i)*4
    for j in range(m+1): r[n][j]=(m-j)*4
    for i in range(n-1,-1,-1):
        for j in range(m-1,-1,-1):
            r[i][j]=min(r[i+1][j]+4,r[i][j+1]+4,r[i+1][j+1]+edit(i,j))
    heard_options=[set() for _ in heard]
    target_options=[set() for _ in target]
    for i in range(n+1):
        for j in range(m+1):
            if i<n and j<m and f[i][j]+edit(i,j)+r[i+1][j+1]==f[n][m]:
                c=edit(i,j)
                op="match" if c==0 else "variant" if c==1 else "substitution"
                heard_options[j].add((op,target[i])); target_options[i].add(op)
            if i<n and f[i][j]+4+r[i+1][j]==f[n][m]: target_options[i].add("deletion")
            if j<m and f[i][j]+4+r[i][j+1]==f[n][m]: heard_options[j].add(("insertion",None))
    path=[]; i,j=n,m
    while i or j:
        if i and j and f[i][j]==f[i-1][j-1]+edit(i-1,j-1):
            c=edit(i-1,j-1); op="match" if c==0 else "variant" if c==1 else "substitution"
            path.append((op,i-1,j-1)); i,j=i-1,j-1
        elif i and f[i][j]==f[i-1][j]+4:
            path.append(("deletion",i-1,None)); i-=1
        else: path.append(("insertion",None,j-1)); j-=1
    operations=[]
    for op,ti,hj in reversed(path):
        expected=target[ti] if ti is not None else None
        stable=target_options[ti]=={"deletion"} if hj is None else heard_options[hj]=={(op,expected)}
        uncertain=not m or not stable or (hj is not None and not reliable(hj))
        operations.append({"operation":op,"targetIndex":ti,"heardIndex":hj,"expected":expected,
                           "heard":heard[hj] if hj is not None else None,"uncertain":uncertain})
    return Local(f[n][m],lo[n][m],hi[n][m],operations)


def _best_local(variants, heard, evidence, word, previous, following):
    # Cheap cost pass first: detailed all-optimal-path analysis only for the
    # winning reference. Dictionary order breaks ties deterministically.
    def cost(reference):
        row = list(range(0, 4*(len(heard)+1), 4))
        for i, phone in enumerate(reference):
            next_row = [(i+1)*4]
            for j, actual in enumerate(heard):
                c = phone_cost(phone, actual, word, reference[i-1] if i else previous,
                               reference[i+1] if i+1<len(reference) else following)
                next_row.append(min(row[j+1]+4, next_row[-1]+4, row[j]+c))
            row = next_row
        return row[-1]
    chosen = min(variants, key=cost)
    result = _local(chosen, heard, evidence, word, previous, following)
    result.target = chosen
    return result


def align_time_first(target,heard,segments,evidence,windows,*,mode="soft",tolerance=BOUNDARY_TOLERANCE,pronunciations=None,allow_partial=False):
    prepared = windows
    if allow_partial:
        prepared = []
        last_owner = -1
        for k, window in enumerate(windows):
            w = dict(window)
            valid = all(isinstance(w.get(v),(int,float)) and math.isfinite(w[v]) for v in ("start","end")) and 0<=w["start"]<w["end"]
            owner = w.get("owners",[])
            trusted = valid and w.get("trusted") and len(owner)==1
            if trusted and owner[0] is not None:
                trusted = isinstance(owner[0],int) and last_owner<owner[0]<len(segments)
                if trusted: last_owner=owner[0]
            # A bad timestamp can contaminate the gap only; never substitute
            # the expected text for what ASR heard.
            if not valid:
                before = [p["end"] for p in windows[:k] if isinstance(p.get("end"),(int,float)) and math.isfinite(p["end"])]
                after = [p["start"] for p in windows[k+1:] if isinstance(p.get("start"),(int,float)) and math.isfinite(p["start"])]
                w["start"] = max(0, before[-1] if before else 0)
                w["end"] = after[0] if after else max([e.get("peakSec",0) for e in evidence]+[w["start"]])+.001
                valid = w["start"]<w["end"]
            if valid:
                prepared.append({**w,"owners":owner if trusted else [None],"trusted":True,"barrier":not trusted})
        # Overlapping or out-of-order timestamps cannot be assigned safely.
        # Combine their union into an unowned barrier, keeping other anchors.
        for k in range(1,len(prepared)):
            if prepared[k]["start"]<prepared[k-1]["start"] or prepared[k]["end"]<prepared[k-1]["end"]:
                prepared[k] = {**prepared[k],"owners":[None],"barrier":True}
                prepared[k-1] = {**prepared[k-1],"owners":[None],"barrier":True}
        prepared.sort(key=lambda w:(w["start"],w["end"]))
        clean=[]
        for w in prepared:
            if clean and w["start"]<clean[-1]["end"]:
                p=clean.pop()
                w={**w,"start":p["start"],"end":max(p["end"],w["end"]),"owners":[None],"barrier":True}
            clean.append(w)
        prepared=clean
    result = _align_complete(target,heard,segments,evidence,prepared,mode=mode,tolerance=tolerance,pronunciations=pronunciations)
    if allow_partial and result["available"]:
        result["partial"] = bool(result["missingTranscriptWords"] or any(not row["heardPhones"] for row in result["words"]))
        result["warnings"] = ["部分单词缺少可靠定位，已保留其余单词的评分；可核对实际转写或重录。"] if result["partial"] else []
        for row in result["words"]:
            row["timingEligible"] = row["start"] is not None and row["wordIndex"] not in result["missingTranscriptWords"]
    return result


def _align_complete(target,heard,segments,evidence,windows,*,mode,tolerance,pronunciations=None):
    if mode not in ("hard","soft"): raise ValueError("Unknown time grouping mode")
    if len(heard)!=len(evidence) or [e.get("token") for e in evidence]!=heard:
        raise ValueError("Phone evidence must describe the same ordered phones")
    word_owners(len(target),segments)
    points=[e.get("peakSec") for e in evidence]
    if any(not isinstance(t,(int,float)) or not math.isfinite(t) or t<0 for t in points) or points!=sorted(points):
        raise ValueError("Phone times must be finite, nonnegative and monotonic")
    if len(heard)>600 or len(segments)>70: raise ValueError("Experimental alignment input is too long")
    if not windows or any(not w.get("trusted") or len(w.get("owners",[]))!=1 for w in windows):
        return {"available":False,"version":VERSION,"mode":mode,
                "reason":"单词时间缺失、插值或文字映射存在多解；请检查实际说出的文字。"}
    if any(not all(isinstance(w.get(k),(int,float)) and math.isfinite(w[k]) for k in ("start","end"))
           or not 0<=w["start"]<w["end"] for w in windows):
        raise ValueError("Invalid word windows")
    if any(windows[i]["start"]<windows[i-1]["start"] or windows[i]["end"]<windows[i-1]["end"] for i in range(1,len(windows))):
        return {"available":False,"version":VERSION,"mode":mode,"reason":"单词时间顺序异常，未生成词级评分。"}
    mapped=[w["owners"][0] for w in windows if w["owners"]!=[None]]
    if any(not isinstance(i,int) or not 0<=i<len(segments) for i in mapped) or mapped!=sorted(set(mapped)):
        return {"available":False,"version":VERSION,"mode":mode,"reason":"目标词映射不连续或存在歧义。"}
    candidates=[]
    for point in points:
        barriers=[i for i,w in enumerate(windows) if w.get("barrier") and w["start"]<=point<=w["end"]]
        options=barriers or [i for i,w in enumerate(windows) if w["start"]-(tolerance if mode=="soft" else 0)<=point<=w["end"]+(tolerance if mode=="soft" else 0)]
        # Hard grouping refuses overlapping ownership instead of picking a word.
        candidates.append(options if mode=="soft" or len(options)==1 else [])
    n,m=len(windows),len(heard)
    @lru_cache(maxsize=None)
    def local(k,start,end):
        owner=windows[k]["owners"][0]
        if owner is None: return _local([],heard[start:end],evidence[start:end],"")
        s=segments[owner]; a,b=s["start"],s["end"]
        if pronunciations:
            return _best_local(pronunciations[owner]["variants"],heard[start:end],evidence[start:end],s["text"],target[a-1] if a else "",target[b] if b<len(target) else "")
        return _local(target[a:b],heard[start:end],evidence[start:end],s["text"],target[a-1] if a else "",target[b] if b<len(target) else "")
    def temporal(k,start,end):
        w=windows[k]
        return sum(round(max(w["start"]-t, t-w["end"],0)*1000) for t in points[start:end])
    best={(0,0):(0,0)}; guaranteed={(0,0):set()}; possible={(0,0):set()}; prev={}
    edges={}
    def relax(src,dst,cost,errors,maybe,kind):
        value=tuple(a+b for a,b in zip(best[src],cost))
        g=guaranteed[src]|errors; p=possible[src]|maybe
        edges.setdefault(src,[]).append((dst,cost,kind))
        if dst not in best or value<best[dst]:
            best[dst]=value; guaranteed[dst]=g; possible[dst]=p; prev[dst]=(src,kind)
        elif value==best[dst]:
            guaranteed[dst]&=g; possible[dst]|=p
    for k in range(n+1):
        for start in range(m+1):
            state=(k,start)
            if state not in best: continue
            if start<m and not candidates[start]:
                relax(state,(k,start+1),(4,0),set(),set(),("orphan",start))
            if k==n: continue
            end=start
            while True:
                l=local(k,start,end); owner=windows[k]["owners"][0]
                errors={owner} if owner is not None and l.minimum_errors else set()
                maybe={owner} if owner is not None and l.maximum_errors else set()
                relax(state,(k+1,end),(l.cost,temporal(k,start,end)),errors,maybe,("word",k,start,end))
                if end==m or k not in candidates[end]: break
                end+=1
    finish=(n,m)
    if finish not in best:
        return {"available":False,"version":VERSION,"mode":mode,"reason":"时间候选无法形成连续词序，未强行配对。"}
    # Backward optimum identifies every feasible globally optimal grouping.
    reverse={finish:(0,0)}
    for state in sorted(best,reverse=True):
        choices=[tuple(a+b for a,b in zip(cost,reverse[dst])) for dst,cost,_ in edges.get(state,[]) if dst in reverse]
        if choices: reverse[state]=min(choices)
    phone_owners=[set() for _ in heard]
    group_options=[set() for _ in windows]
    for src,options in edges.items():
        for dst,cost,kind in options:
            if dst not in reverse or tuple(a+b+c for a,b,c in zip(best[src],cost,reverse[dst]))!=best[finish]: continue
            if kind[0]=="orphan": phone_owners[kind[1]].add(None)
            else:
                _,k,a,b=kind; group_options[k].add((a,b))
                for j in range(a,b): phone_owners[j].add(windows[k]["owners"][0])
    groups=[]; state=finish
    while state!=(0,0):
        src,kind=prev[state]; groups.append(kind); state=src
    references=[target[s["start"]:s["end"]] for s in segments]
    for kind in groups:
        if kind[0]=="word":
            _,k,a,b=kind; owner=windows[k]["owners"][0]
            if owner is not None and local(k,a,b).target is not None: references[owner]=local(k,a,b).target
    offsets=[]; effective_target=[]
    for reference in references:
        offsets.append(len(effective_target)); effective_target.extend(reference)
    operations=[]; chosen_groups={}; orphan_indices=[]
    for kind in reversed(groups):
        if kind[0]=="orphan":
            j=kind[1]; orphan_indices.append(j)
            operations.append({"operation":"insertion","targetIndex":None,"heardIndex":j,"wordIndex":None,
                               "expected":None,"heard":heard[j],"uncertain":True})
            continue
        _,k,a,b=kind; owner=windows[k]["owners"][0]; chosen_groups[k]=(a,b)
        offset=offsets[owner] if owner is not None else 0
        for p in local(k,a,b).operations:
            hi=p["heardIndex"]+a if p["heardIndex"] is not None else None
            operations.append({**p,"targetIndex":p["targetIndex"]+offset if p["targetIndex"] is not None else None,
                               "heardIndex":hi,"wordIndex":owner,
                               "uncertain":p["uncertain"] or owner is None or len(group_options[k])>1})
    missing=sorted(set(range(len(segments)))-set(mapped))
    for owner in missing:
        for ti in range(offsets[owner],offsets[owner]+len(references[owner])):
            operations.append({"operation":"deletion","targetIndex":ti,"heardIndex":None,"wordIndex":owner,
                               "expected":effective_target[ti],"heard":None,"uncertain":True})
    # A missing transcript word has no real time evidence; keep it explicitly
    # uncertain rather than invent an acoustic deletion or a confident score.
    distance=(best[finish][0]+sum(4*len(references[i]) for i in missing))/4
    rows=[]
    for i,s in enumerate(segments):
        slot=next((k for k,w in enumerate(windows) if w["owners"]==[i]),None)
        a,b=chosen_groups.get(slot,(0,0))
        phones=[p for p in operations if p["wordIndex"]==i]
        uncertain=i in missing or slot is None or a==b or len(group_options[slot])>1 or any(p["uncertain"] for p in phones)
        status="needs-work" if i in guaranteed[finish] else "uncertain" if uncertain or i in possible[finish] else "no-clear-error"
        rows.append({"wordIndex":i,"word":s["text"],"start":windows[slot]["start"] if slot is not None else None,
                     "end":windows[slot]["end"] if slot is not None else None,"status":status,
                     "expectedPhones":references[i],"heardPhones":heard[a:b] if slot is not None else [],
                     **({"pronunciation":{**pronunciations[i],"variants":None,"selectedPhones":references[i]}} if pronunciations else {}),
                     "heardIndices":list(range(a,b)) if slot is not None else [],"phoneDetailsUncertain":uncertain})
    assert sorted(p["heardIndex"] for p in operations if p["heardIndex"] is not None)==list(range(m))
    assert sorted(p["targetIndex"] for p in operations if p["targetIndex"] is not None)==list(range(len(effective_target)))
    return {"available":True,"version":VERSION,"mode":mode,"toleranceSeconds":tolerance if mode=="soft" else 0,
            "operations":operations,"words":rows,"certainErrorWords":sorted(guaranteed[finish]),
            "possibleErrorWords":sorted(possible[finish]),"missingTranscriptWords":missing,
            "orphanHeardIndices":orphan_indices,"phoneOwnerCandidates":[sorted(v,key=lambda o:-1 if o is None else o) for v in phone_owners],
            "sentenceEditDistance":distance,"consistencyIndex":round(max(0,100*(1-distance/max(len(effective_target),len(heard),1)))),
            "scoreKind":"experimental-phoneme-consistency-not-calibrated",
            "groupingCost":best[finish][0],"temporalCost":best[finish][1]}
