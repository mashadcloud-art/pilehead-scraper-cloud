function prepareProductObject(product, config, seo) {
  const regular = (product.price || '').toString().replace(/[^0-9.]/g, '');
  const sale = (product.salePrice || '').toString().replace(/[^0-9.]/g, '');
  const images = Array.isArray(product.galleryImages) ? product.galleryImages : [];

  const wc = {
    name: product.title,
    type: 'simple',
    regular_price: regular || '',
    sale_price: sale || '',
    description: seo.longDescription || product.description || '',
    short_description: seo.shortDescription || '',
    sku: product.sku || '',
    categories: [
      { id: product.category }, // plugin handles name→ID mapping if supported
      { id: product.subcategory }
    ],
    images: images.map(src => ({ src })),
    attributes: product.attributes || [],
    meta_data: [
      { key: '_yoast_wpseo_title', value: seo.title || '' },
      { key: '_yoast_wpseo_metadesc', value: seo.metaDescription || '' },
      { key: '_yoast_wpseo_focuskw', value: seo.focusKeywords || '' },
      { key: '_seo_schema_json', value: seo.schemaJson || '' }
    ]
  };

  return {
    product,
    seo,
    wc,
    cloud: {
      mainImage: product.image || '',
      gallery: images
    },
    assets: {
      datasheetUrl: product.datasheetUrl || '',
      localDatasheetPath: product.localDatasheetPath || '',
      localImagePath: product.localImagePath || '',
      localGalleryPaths: Array.isArray(product.localGalleryPaths) ? product.localGalleryPaths : []
    }
  };
}

module.exports = {
  prepareProductObject
};
