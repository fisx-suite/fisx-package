/**
 * @file 字符串相关工具方法
 * @author sparklewhy@gmail.com
 */

module.exports = exports = {};

/**
 * 计算字符的 utf-8 长度
 *
 * @param {string} x 字符
 * @return {number}
 */
function getCharUTF8Length(x) {
    var code = x.charCodeAt(0);

    if ((code & ~0x7F) === 0) {
        return 1;
    }

    if ((code & ~0x07FF) === 0) {
        return 2;
    }

    if ((code & ~0xFFFF) === 0) {
        return 3;
    }

    return 4;
}

/**
 * 遍历字符串的每个字符
 *
 * @param {string} str 要处理的字符串
 * @param {Function} callback 每次遍历的回调, 传入当前已遍历字符长度
 */
function loopString(str, callback) {
    var size = 0;

    for (var i = 0, len = str.length; i < len; i++) {
        var target = str.charAt(i);
        var length = (getCharUTF8Length(target) + 1) / 2;

        size += length;
        if (callback(size, i + 1) === false) {
            break;
        }
    }
}

/**
 * 获得字符串长度（双字节占两个长度）
 *
 * @param {string} str 要获取长度的字符串
 * @return {number}
 */
exports.getStrLen = function (str) {
    if (str === '') {
        return 0;
    }

    var ret = '';
    loopString(str, function (cnLen) {
        ret = cnLen;
    });

    return ret;
};

/**
 * 获得截断后的字符串
 *
 * @param {string} str 需要截断的字符串
 * @param {number} len 截断的字符长度, 中文算两个字符
 * @param {string|boolean} suffix 结尾字符, 不传则用 ...，如果不想加后缀，传false
 * @return {string}
 */
exports.truncate = function (str, len, suffix) {
    if (str == null) {
        return '';
    }

    str = String(str);
    len = parseInt(len, 10);

    if (suffix === false) {
        suffix = '';
    }
    else if (!suffix) {
        suffix = '...';
    }

    var ret = '';
    loopString(str, function (cnLen, enLen) {
        ret = str.substr(0, enLen);

        if (cnLen > len) {
            ret += suffix;
            return false;
        }
    });

    return ret;
};
