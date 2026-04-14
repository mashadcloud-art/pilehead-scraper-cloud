const { shell } = require('electron');

function showActions(rowElement, wpLinks, gcsLink, onDelete) {
  if (!rowElement) return;
  const targetBtn = rowElement.querySelector('.btn-open-target');
  const wpBtn = rowElement.querySelector('.btn-open-wp');
  const editBtn = rowElement.querySelector('.btn-edit-wp');
  const gcsBtn = rowElement.querySelector('.btn-open-gcs');
  const deleteBtn = rowElement.querySelector('.btn-delete');
  if (wpBtn && wpLinks?.view) wpBtn.onclick = () => { try { shell.openExternal(wpLinks.view); } catch (_) {} };
  if (editBtn && wpLinks?.edit) editBtn.onclick = () => { try { shell.openExternal(wpLinks.edit); } catch (_) {} };
  if (gcsBtn && gcsLink) gcsBtn.onclick = () => { try { shell.openExternal(gcsLink); } catch (_) {} };
  if (deleteBtn && typeof onDelete === 'function') deleteBtn.onclick = onDelete;
}

module.exports = { showActions };
