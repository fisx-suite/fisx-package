/**
 * @file 脚手架下载安装管理
 * @author sparklewhy@gmail.com
 */

var debug = require('debug')('scaffold-pkg');

module.exports = exports = {};

function downloadFromRemote(pkg) {
    var version = pkg.version;
    var repos = pkg.repos;
    if (repos.needResolve()) {
        return repos.fetchAvailableVersion(version).then(
            function (result) {
                debug('fetch %s meta data: ok', pkg);
                return repos.fetchVersionMetaData(result);
            }
        ).then(function (result) {
            debug('fetch %s version meta data: ok', pkg);
            return repos.download(result);
        });
    }
    return repos.download();
}

/**
 * 下载脚手架
 *
 * @param {string} uri 下载资源 uri
 * @param {Object} options 下载选项
 * @param {boolean=} options.forceLatest 是否强制最新，如果 true，会忽略 cache
 * @param {string=} options.domain 设置 gitlab 源的 domain
 * @param {string=} options.token 设置 gitlab 源的 token
 * @param {string=} options.registry 设置 npm 源的 registry
 * @return {Promise}
 */
exports.download = function (uri, options) {
    var Spinner = require('./spinner');
    var spinner = new Spinner('downloading ' + uri + '...');
    spinner.start();

    var Package = require('./package');
    var pkgOpts = Package.parse(uri);

    var pkg = new Package(pkgOpts);
    debug('pkg opts: %j', pkgOpts);

    var repos = pkg.repos;
    repos.component = false;
    if (options.forceLatest) {
        repos.useCache = false;
    }

    var result = null;
    debug('begin download: %s, %j', uri, options);
    if (options.forceLatest) {
        result = downloadFromRemote(pkg);
    }
    else {
        debug('try read from cache...');
        result = repos.readFromCache(true).then(
            null,
            function (err) {
                debug('read from cache fail: %s', err);
                return downloadFromRemote(pkg);
            }
        );
    }

    return result.then(
        function (result) {
            var fs = require('fs');
            var path = require('path');
            var pkgRoot = result.dir;
            var dirs = [];
            var fileNum = 0;
            fs.readdirSync(pkgRoot).some(
                function (file) {
                    var fullPath = path.join(pkgRoot, file);
                    var stat = fs.statSync(fullPath);

                    if (/^\./.test(file)) {
                        return;
                    }

                    if (stat.isDirectory()) {
                        dirs.push(fullPath);
                    }
                    else if (stat.isFile()) {
                        fileNum++;
                    }

                    if (fileNum) {
                        return true;
                    }
                }
            );

            if (!fileNum && dirs.length === 1) {
                pkgRoot = dirs[0];
            }

            result.source = pkgRoot;
            return result;
        }
    ).finally(function () {
        spinner.stop();
        var cache = require('./cache');
        cache.saveReposCacheInfo();
    });
};
