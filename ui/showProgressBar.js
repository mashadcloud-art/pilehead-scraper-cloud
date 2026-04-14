function showProgressBar(stepLabel, percent) {
  const bar = document.getElementById('progress-bar');
  const status = document.getElementById('status-log');
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  if (status) {
    const div = document.createElement('div');
    div.innerText = stepLabel;
    status.appendChild(div);
    status.scrollTop = status.scrollHeight;
  }
}
module.exports = { showProgressBar };
