/**
 * @file 入口模块
 * @author sparklewhy@gmail.com
 */

var Promise = require('bluebird');
var Timer = require('./lib/timer');

function initDefaultConfig(options) {
    options || (options = {});

    var config = require('./lib/config');
    if (options.registry) {
        config.defaultNPMRegistry = options.registry;
    }

    if (options.token) {
        config.defaultGitlabToken = options.token;
    }

    if (options.domain) {
        config.defaultGitlabDomain = options.domain;
    }
}

function wrapTimer(func, logPrefix) {
    return function () {
        var timer = new Timer();
        timer.start();
        var logger = require('./lib/config').log;

        var opts = arguments.length > 1 ? arguments[1] : arguments[0];
        initDefaultConfig(opts);

        return func.apply(this, arguments).finally(function () {
            logger.time((logPrefix || 'All') + ' done in ' + timer.getTotalTime(true));
        });
    };
}

module.exports = exports = {
    get install() {
        return wrapTimer(require('./lib/command/install'), 'Install');
    },
    get uninstall() {
        return wrapTimer(require('./lib/command/uninstall'), 'Uninstall');
    },
    get update() {
        return wrapTimer(require('./lib/command/update'), 'Update');
    },
    get list() {
        return wrapTimer(require('./lib/command/list'), 'List');
    },
    get search() {
        return wrapTimer(require('./lib/command/search'), 'Search');
    },
    get config() {
        return require('./lib/config');
    }
};

function initPkgManage(fis) {
    // 应用  fis-conf.js 自定义的配置
    var pkgManageConfig = exports.config;
    pkgManageConfig.initConfig(fis.config);

    pkgManageConfig.log = fis.log;
}

exports.cache = function (fis) {
    initPkgManage(fis);

    var cache = require('./lib/cache');
    return {
        showCacheDir: function (type) {
            var dir = cache.getCacheDir(type);
            fis.log.info('cache dir: %s', dir.green);
        },
        clearCache: function (type, components) {
            cache.clearCache(type, components);
            fis.log.info('clear cache done');
        }
    };
};

exports.scaffold = function (fis) {
    initPkgManage(fis);

    return {
        download: wrapTimer(require('./lib/scaffold').download, 'Download scaffold'),
        prompt: require('./lib/helper').prompt
    };
};

/**
 * 初始化项目根目录
 *
 * @param {string} fisConfigFile  配置文件
 * @param {Object} options 选项
 * @param {Object} fis fis 对象
 * @return {Promise}
 */
exports.initProjectRoot = function (fisConfigFile, options, fis) {
    var findup = require('findup');

    return new Promise(function (resolve, reject) {
        var fup = findup(options.root, fisConfigFile);
        var dir = null;

        fup.on('found', function (found) {
            dir = found;
            fup.stop();
        });

        fup.on('error', reject);

        fup.on('end', function () {
            resolve(dir);
        });
    }).then(
        function (dir) {
            dir && (options.root = dir);
            return options.root;
        }
    ).then(
        function (dir) {
            fis.project.setProjectRoot(dir);
            return dir;
        }
    );
};

/**
 * 加载用户配置
 *
 * @param {Object} configFile 配置文件
 * @param {Object} options 选项
 * @param {Object} fis fis 对象
 * @return {Promise}
 */
exports.loadUserConfig = function (configFile, options, fis) {
    // 应用  fis-conf.js 自定义的配置
    var pkgManageConfig = exports.config;
    pkgManageConfig.initConfig(fis.config);

    // fis3 log.error 方法调用是会强制退出程序的。。
    pkgManageConfig.log = fis.log;
    return Promise.resolve();
};
