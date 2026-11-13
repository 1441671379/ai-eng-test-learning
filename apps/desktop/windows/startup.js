window.startup.subscribe(value => {
  const list = document.getElementById('services');
  list.replaceChildren(...Object.values(value.services).map(service => {
    const row = document.createElement('li');
    row.textContent = `${service.ready ? '✓' : '·'} ${service.label} — ${service.message}`;
    return row;
  }));
  document.getElementById('progress').value = Object.values(value.services).filter(service => service.ready).length;
  document.getElementById('hardware').textContent = value.hardware || '';
  document.getElementById('error').textContent = value.error || '';
  document.getElementById('retry').hidden = !value.error;
});
document.getElementById('retry').onclick = () => window.startup.retry();
document.getElementById('logs').onclick = () => window.startup.logs();
