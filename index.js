/**
 * @file 入口模块
 * @author sparklewhy@gmail.com
 */

var Promise = require('bluebird');

module.exports = exports = {
    get install() {
        return require('./lib/command/install');
    },
    get uninstall() {
        return require('./lib/command/uninstall');
    },
    get update() {
        return require('./lib/command/update');
    },
    get list() {
        return require('./lib/command/list');
    },
    get search() {
        return require('./lib/command/search');
    },
    get config() {
        return require('./lib/config');
    }
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
    var filepath = require('path').resolve(options.root, configFile);

    try {
        require(filepath);
    }
    catch (ex) {
        // do nothing
    }

    // 应用  fis-conf.js 自定义的配置
    var pkgManageConfig = exports.config;
    pkgManageConfig.initConfig(fis.config);

    // fis3 log.error 方法调用是会强制退出程序的。。
    pkgManageConfig.log = fis.log;

    return Promise.resolve();
};

