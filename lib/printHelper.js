/**
 * @file 打印助手工具方法
 * @author sparklewhy@gmail.com
 */

var config = require('./config');
var project = require('./project');

module.exports = exports = {};

exports.getPkgNameInfo = function (pkg) {
    var pkgName = pkg.name;

    var typeInfo = (config.defaultEndPoint.type !== pkg.endPoint.type)
        ? (pkg.endPoint.type + ':')
        : '';

    // 安装过程可能会存在安装卸载再安装失败过程，所以统一从安装过的包获取安装信息
    var installedPkg = project.findInstalledPkg(pkgName);
    var pkgVersion = installedPkg && installedPkg.installVersion;
    if (!pkg.installed && pkg.oldVersion) {
        pkgVersion = pkg.oldVersion;
    }

    return {
        type: typeInfo,
        name: pkgName,
        version: pkgVersion
    };
};

exports.getPkgReposUrl = function (metaData) {
    var repoUrl;
    repoUrl = metaData.repository;
    if (repoUrl && repoUrl.url) {
        repoUrl = repoUrl.url;
    }
    if (repoUrl) {
        repoUrl = repoUrl
            .replace(/^git\+/, '')
            .replace(/^git/, 'http');
    }
    return repoUrl;
};

function getAuthorValue(data) {
    if (!data) {
        return;
    }

    if (typeof data === 'string' && data.trim().length) {
        return data.trim();
    }

    if (Array.isArray(data)) {
        var values = [];
        data.forEach(function (item) {
            var result = getAuthorValue(item);
            result && values.push(result);
        });

        if (values.length) {
            return values;
        }
        return;
    }

    var name = (data.name || '').trim();
    var email = (data.email || '').trim();
    if (!name && email) {
        return email;
    }

    if (name && email) {
        return name + ' <' + email + '>';
    }

    return name;
}

exports.getPkgAuthorInfo = function (metaData) {
    var author = getAuthorValue(
        metaData.author
        || metaData.contributors
        || metaData.maintainers
    );

    if (author && !Array.isArray(author)) {
        return [author];
    }

    return author;
};

/**
 * 获取所有安装的包，不包含重复的包
 *
 * @param {Array.<Package>} installPkgs 安装的包
 * @return {Array.<Package>}
 */
exports.getAllInstallPkgs = function (installPkgs) {
    var flattenInstallPkgs = [];
    var addedMap = {};
    var initPkgs = [].concat(installPkgs);
    var push = Array.prototype.push;

    while (initPkgs.length) {
        var pkg = initPkgs.shift().getRealPackage();
        var key = pkg.name;
        if (addedMap[key]) {
            continue;
        }

        addedMap[key] = 1;
        flattenInstallPkgs.push(pkg);

        push.apply(initPkgs, pkg.getDependencies());
    }

    addedMap = null;
    return flattenInstallPkgs;
};
