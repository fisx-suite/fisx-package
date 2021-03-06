/**
 * @file dependencies scheme 定义
 * @author sparklewhy@gmail.com
 */

var util = require('util');
var config = require('./config');
var REPOS_TYPE = config.reposType;

/**
 * 解析版本信息
 *
 * @inner
 * @param {string} versionStr 包含版本信息字符串
 * @param {string} versionSeperator 版本号分隔符
 * @return {Object}
 */
function parseVersionInfo(versionStr, versionSeperator) {
    var lastAtIdx = versionStr.lastIndexOf(versionSeperator);
    if (lastAtIdx !== -1 && lastAtIdx !== 0) {
        // 忽略 scoped name: @scope/pkgname
        return {
            name: versionStr.substring(0, lastAtIdx).trim(),
            version: versionStr.substr(lastAtIdx + 1).trim()
        };
    }

    return {name: versionStr};
}

/**
 * 解析包仓库源类型信息
 *
 * @inner
 * @param {string} pkgStr 包字符串
 * @param {string} endPointType 仓库源类型
 * @param {string} versionSeperator 版本号分隔符
 * @return {{endPoint: Object, name: string, version: string}}
 */
function parseEndPointInfo(pkgStr, endPointType, versionSeperator) {
    var endPoint;
    if (endPointType === REPOS_TYPE.LOCAL || endPointType === REPOS_TYPE.URL) {
        var spaceIdx = pkgStr.indexOf(' ');
        endPoint = {
            type: endPointType,
            value: pkgStr.substring(0, spaceIdx)
        };
        pkgStr = pkgStr.substr(spaceIdx).trim();
    }
    else {
        var segments = pkgStr.split('/');
        var len = segments.length;

        // 忽略 scoped name: @scope/pkgname
        if (!/^@/.test(pkgStr) && len > 1) {
            if (endPointType
                && endPointType !== REPOS_TYPE.GITHUB
                && endPointType !== REPOS_TYPE.GITLAB
            ) {
                throw new Error(
                    util.format(
                        'parse endpoint %s value fail: %s, require github/gitlab',
                        endPointType, pkgStr
                    )
                );
            }
            endPoint = {
                type: endPointType || REPOS_TYPE.GITHUB,
                value: segments.shift().trim()
            };
            pkgStr = segments.join('/').trim();

            // 将 a/b#version 版本号分隔符规范化下
            pkgStr = pkgStr.replace('#', versionSeperator);
        }
        else {
            endPointType && (endPoint = {type: endPointType});
        }
    }

    var versionInfo = parseVersionInfo(pkgStr, versionSeperator);
    return {
        endPoint: endPoint,
        name: versionInfo.name,
        version: versionInfo.version
    };
}

/**
 * 提取包的信息
 *
 * @inner
 * @param {string} pkgStr 要提取信息的字符串
 * @param {string} versionSeperator 版本号分隔符
 * @return {{endPoint: Object, name: string, version: string}}
 */
function extractPkgInfo(pkgStr, versionSeperator) {
    var segments = pkgStr.split(':');
    var len = segments.length;
    if (len === 1) {
        return parseEndPointInfo(pkgStr, null, versionSeperator);
    }

    var endPointType = segments.shift().trim().toLowerCase();
    var pkgInfoStr = segments.join(':').trim();
    return parseEndPointInfo(pkgInfoStr, endPointType, versionSeperator);
}

/**
 * 解析 git url
 *
 * @inner
 * @param {string} url 要解析 url
 * @return {boolean|Object}
 */
function parseGitURL(url) {
    var reg = null;
    var result = null;

    if (/^git:/.test(url)) {
        reg = /^git:\/\/([^\/]+)\/([^\/]+)\/(.+)\.git(#(.*))?$/;
        result = reg.exec(url);
        return {
            endPoint: {
                type: REPOS_TYPE.GITLAB,
                reposDomain: 'http://' + result[1],
                value: result[2]
            },
            name: result[3],
            version: result[5] || ''
        };
    }
    else if (/^git\+(ssh|http|https):/.test(url)) {
        reg = /^git\+(ssh|http|https):\/\/([^@]+)@([^\/]+)[\/:](.+)\.git(#(.*))?$/;
        result = reg.exec(reg);

        var domain = result[1] + '://' + result[3];
        domain = domain.replace(/^ssh/, 'http');

        return {
            endPoint: {
                type: REPOS_TYPE.GITLAB,
                reposDomain: domain,
                value: result[2]
            },
            name: result[4],
            version: result[6] || ''
        };
    }

    return false;
}

/**
 * 是否是本地文件 scheme
 * 形如 abc, owner/project 这种都不算 local path
 *
 * @param {string} value 要判断值
 * @return {boolean}
 */
function isLocalFileScheme(value) {
    var result = !(/^\/\//.test(value)
    || /^[a-z][a-z0-9\+\-\.]+:/i.test(value));
    return result && !/^[\w-]+[^\/\/]*(@[^\/\/]*)?(\/|$)/.test(value) && !/^@/.test(value);
}

/**
 * 是否是 URI scheme
 *
 * @param {string} value 要判断值
 * @return {boolean}
 */
function isURIScheme(value) {
    return /^[a-z][a-z0-9\+\-\.]+:/i.test(value) || /[^=\/]+\/[^=]*$/.test(value);
}

/**
 * 是否是 HTTP scheme
 *
 * @param {string} value 要判断值
 * @return {boolean}
 */
function isHTTPScheme(value) {
    return /^http(s)?:\/\//.test(value);
}

/**
 * 规范化下包的 ID: 移除 file: 前缀
 *
 * @param {string} value  包 id
 * @return {string}
 */
function normalizePkgID(value) {
    return (value && value.trim()) || '';
    // var reg = new RegExp('^' + REPOS_TYPE.LOCAL + ':', 'i');
    // return value.replace(reg, '');
}

/**
 * 解析包的信息
 *
 * @inner
 * @param {string} pkgStr 要解析的字符串
 * @param {boolean=} supportAliasName 是否支持别名机制，可选，默认 false
 * @param {string=} versionSeperator 版本号分隔符，可选，默认 `@`
 * @return {?Object}
 */
function parsePkgStr(pkgStr, supportAliasName, versionSeperator) {
    pkgStr = normalizePkgID(pkgStr);
    if (!pkgStr) {
        return {};
    }

    if (!versionSeperator) {
        versionSeperator = '@';
    }

    var aliasName;
    if (supportAliasName && /^[\w-]+=.+/.test(pkgStr)) {
        var segments = pkgStr.split('=');
        if (segments.length > 1) {
            aliasName = segments.shift().trim();
            pkgStr = pkgStr.replace(aliasName, '').replace(/^\s*=\s*/, '');
        }
    }

    if (isLocalFileScheme(pkgStr)) {
        // load from local file
        return {
            endPoint: {
                type: REPOS_TYPE.LOCAL,
                value: pkgStr
            }
        };
    }
    else if (isHTTPScheme(pkgStr)) {
        // load from url
        return {
            endPoint: {
                type: REPOS_TYPE.URL,
                value: pkgStr
            }
        };
    }

    var result = parseGitURL(pkgStr);
    if (result) {
        return result;
    }

    var options = extractPkgInfo(pkgStr, versionSeperator);
    options && (options.aliasName = aliasName);

    return options;
}

exports.normalizePkgID = normalizePkgID;
exports.parsePkgStr = parsePkgStr;
exports.isURIScheme = isURIScheme;
exports.isLocalFileScheme = isLocalFileScheme;
