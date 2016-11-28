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

function getFormatAuthorInfo(data) {
    var value = getAuthorValue(data);
    if (!value) {
        return;
    }

    if (!Array.isArray(value)) {
        value = [value];
    }

    return value.map(function (item) {
        return item.cyan;
    }).join(', ');
}

exports.getPkgAuthorInfo = function (metaData) {
    return {
        author: getFormatAuthorInfo(metaData.author),
        contributors: getFormatAuthorInfo(metaData.contributors),
        maintainers: getFormatAuthorInfo(metaData.maintainers)
    };
};

exports.getKeywordsInfo = function (metaData) {
    var keywords = metaData.keywords;

    if (keywords && typeof keywords === 'string') {
        keywords = keywords.split(',');
    }

    if (Array.isArray(keywords) && keywords.length) {
        keywords = keywords.map(function (item) {
            return item.gray;
        }).join(', ');
    }
    else {
        keywords = null;
    }

    return keywords;
};

exports.getLicenceInfo = function (metaData) {
    var licence = metaData.license;
    if (typeof licence === 'object' && licence) {
        licence = licence.type + (licence.url ? ' (' + licence.url.blue + ')' : '');
    }
    else if (licence) {
        licence = licence.cyan;
    }

    if (metaData.private) {
        licence ? (licence += ' ') : (licence = '');
        licence += 'private'.yellow;
    }
    return licence;
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
