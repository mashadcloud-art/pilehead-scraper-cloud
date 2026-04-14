const { getProductView } = require('./productView');

/**
 * Returns data for side-by-side comparison.
 * @param {string} filePath 
 * @returns {object}
 */
function getComparison(filePath) {
    const view = getProductView(filePath);
    return {
        original: view.original,
        rewritten: {
            title: view.current.seoTitle || view.current.title,
            description: view.current.metaDescription,
            content: view.current.longDescription || view.current.description,
            specs: view.current.specs
        }
    };
}

module.exports = { getComparison };
