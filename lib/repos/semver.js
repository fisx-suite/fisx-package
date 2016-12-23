/**
 * @file 版本号相关工具方法
 * @author sparklewhy@gmail.com
 */

var semver = require('semver');
var debug = require('debug')('semver');

/**
 * 判断给定的版本是否冲突，如果版本号不符合 semver 规范，且不相等，则认为是冲突的
 *
 * @param {string} a 要判断的版本 a
 * @param {string} b 要判断的版本 b
 * @return {boolean}
 */
semver.isConflict = function (a, b) {
    var hasConflict = (a !== b) && a && b;
    if (semver.valid(a) && semver.valid(b)) {
        var majorA = semver.major(a);
        var majorB = semver.major(b);

        if (majorA === majorB) {
            // 对于 0.x.x 预发布版本的的 minor 版本号，也可能不兼容
            return majorA === 0 && semver.minor(a) !== semver.minor(b);
        }
    }

    return !!hasConflict;
};

/**
 * 排序给定的版本号列表
 *
 * @param {Array.<string|Object>} versionList 版本号列表
 * @param {string=} key 版本号 key，当列表数据项值为对象时指定，可选，默认 `version`
 * @param {boolean=} isDesc 是否降序排序，可选，默认 false
 * @return {Array}
 */
semver.sortVersions = function (versionList, key, isDesc) {
    if (arguments.length === 2) {
        if (typeof arguments[1] === 'boolean') {
            var tmp = key;
            key = isDesc;
            isDesc = tmp;
        }
    }

    var isObj = versionList[0] && typeof versionList[0] === 'object';
    var factor = isDesc ? -1 : 1;
    key || (key = 'version');
    return versionList.sort(function (a, b) {
        if (isObj) {
            a = a[key];
            b = b[key];
        }

        if (semver.valid(a) && semver.valid(b)) {
            return semver.compare(a, b) * factor;
        }
        return a.localeCompare(b) * factor;
    });
};

/**
 * 规范化版本
 *
 * @param {string} version 要规范化的版本
 * @return {string}
 */
semver.normalizeVersion = function (version) {
    return version && version.replace(/^v\s*/i, '').trim();
};

/**
 * 获取最大满足的版本号
 *
 * @param {Array.<string>} candidates 候选版本号列表
 * @param {string} allowVersion 允许的版本
 * @return {string}
 */
semver.maxSatisfyVersion = function (candidates, allowVersion) {
    if (candidates.indexOf(allowVersion) !== -1) {
        return allowVersion;
    }

    try {
        return semver.maxSatisfying(candidates, allowVersion);
    }
    catch (ex) {
        debug(ex.stack || ex);
    }
};

module.exports = exports = semver;
