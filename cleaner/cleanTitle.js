const { cleanTitle: unifiedCleanTitle } = require('../scraper/unified/cleaner');

function cleanTitle(input) {
  return unifiedCleanTitle(input);
}

module.exports = {
  cleanTitle
};
