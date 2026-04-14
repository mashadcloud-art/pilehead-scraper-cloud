function productSummaryCard(containerId, product, seo) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const card = document.createElement('div');
  card.style.border = '1px solid rgba(31,41,55,0.9)';
  card.style.borderRadius = '12px';
  card.style.padding = '10px';
  card.style.marginTop = '8px';
  card.innerHTML = `
    <div style="display:flex; gap:10px; align-items:flex-start;">
      <img src="${product.image || ''}" alt="${product.title || ''}" style="width:60px; height:60px; object-fit:cover; border-radius:8px;">
      <div>
        <div style="font-weight:600; color:#e5e7eb;">${product.title || ''}</div>
        <div style="font-size:12px; color:#9ca3af;">${product.brand || ''} · ${product.category || ''}</div>
        <div style="font-size:12px; color:#9ca3af;">AED ${product.price || '—'}</div>
        <div style="margin-top:6px; font-size:11px; color:#cbd5e1;">SEO: ${seo?.title || ''}</div>
      </div>
    </div>
  `;
  el.appendChild(card);
}
module.exports = { productSummaryCard };
