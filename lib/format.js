/**
 * @file 格式化相关工具方法
 * @author sparklewhy@gmail.com
 */

var strUtil = require('./string');

module.exports = exports = {};

/**
 * 获取指定数量的空白字符串
 *
 * @param {number} num 空白数量
 * @return {string}
 */
function getSpaceStr(num) {
    var i = 0;
    var space = '';
    while (i < num) {
        space += ' ';
        i++;
    }
    return space;
}

exports.getSpaceStr = getSpaceStr;

/**
 * 对齐给定的值数组
 *
 * @param {Array.<string>} values 值数组
 * @param {string=} aliment 对齐方式，默认左对齐，可选，'left'|'right'|'center'
 * @return {Array.<string>}
 */
exports.alignValues = function (values, aliment) {
    var maxLen = 0;
    var lenArr = [];
    values.forEach(function (v, index) {
        var len = strUtil.getStrLen(v);
        lenArr[index] = len;
        if (len > maxLen) {
            maxLen = len;
        }
    });

    aliment = aliment.toLowerCase();
    values = values.map(function (v, index) {
        var diff = maxLen - lenArr[index];
        if (!diff) {
            return v;
        }

        switch (aliment) {
            case 'right':
                v = getSpaceStr(diff) + v;
                break;
            case 'center':
                var leftSpaces = Math.ceil(diff / 2);
                v = getSpaceStr(leftSpaces) + v + getSpaceStr(diff - leftSpaces);
                break;
            default: // left
                v = v + getSpaceStr(diff);
        }

        return v;
    });

    return values;
};
