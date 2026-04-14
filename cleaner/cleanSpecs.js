const { cleanSpecs: unifiedCleanSpecs } = require('../scraper/unified/cleaner');

function cleanSpecs(obj) {
  return unifiedCleanSpecs(obj);
}

module.exports = {
  cleanSpecs
};
