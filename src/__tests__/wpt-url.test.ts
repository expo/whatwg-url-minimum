import { excluded } from './fixtures/wpt-harness';

excluded([]);

require('./wpt/url-constructor.any.js');
require('./wpt/url-origin.any.js');
require('./wpt/url-searchparams.any.js');
require('./wpt/url-setters-stripping.any.js');
require('./wpt/url-setters.any.js');
require('./wpt/url-statics-canparse.any.js');
require('./wpt/url-statics-parse.any.js');
require('./wpt/url-tojson.any.js');
