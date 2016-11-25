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

function getColWidthInfo(data) {
    var rLen = data.length;
    var cLen = rLen ? data[0].length : 0;
    var lenArr = [];
    var colMaxLens = [];
    for (var c = 0; c < cLen; c++) {
        var maxLen = 0;
        for (var r = 0; r < rLen; r++) {
            var v = String(data[r][c]);
            var len = strUtil.getStrLen(v);
            lenArr[c][r] = len;
            if (len > maxLen) {
                maxLen = len;
            }
        }
        colMaxLens[c] = maxLen;
    }

    return {
        colMaxWidths: colMaxLens,
        valueWidthArr: lenArr
    };
}

function doAlignValue(value, diff, alignment) {
    switch (alignment) {
        case 'right':
            value = getSpaceStr(diff) + value;
            break;
        case 'center':
            var leftSpaces = Math.ceil(diff / 2);
            value = getSpaceStr(leftSpaces) + value + getSpaceStr(diff - leftSpaces);
            break;
        default: // left
            value = value + getSpaceStr(diff);
    }

    return value;
}

/**
 * 对齐值，如果要对齐的值超过要对齐的宽度，会被拆成多行，如果不想，想以 ... 形式，
 * 设置 `opts.truncate` true，通过设置 `opts.suffix` 设置截断后的后缀
 *
 * @param {string} value 要对齐的值
 * @param {Object} opts 对齐选项
 * @param {number} opts.width 对齐后的宽度
 * @param {number=} opts.valueWidth 当前要对齐的值的宽度，可选，如果未设置，默认重新计算
 * @param {string=} opts.alignment 对齐方式，可选，默认左对齐，有效值：'left'|'right'|'center'
 * @param {boolean=} opts.truncate 是否截断，当超过给定的宽度，默认 false，会被拆分成多行
 * @param {string=} opts.suffix 是否要增加的后缀，截断时候提供，不想后缀，设为 false
 * @return {string|Array.<string>}
 */
function alignValue(value, opts) {
    value = String(value);

    var width = opts.width;
    var valueWidth = opts.valueWidth || strUtil.getStrLen(value);
    var alignment = opts.alignment && opts.alignment.toLowerCase();

    var diff = width - valueWidth;
    if (diff >= 0) {
        return doAlignValue(value, diff, alignment);
    }

    var tmp = value;
    if (opts.truncate) {
        var suffix = opts.suffix;
        var truncateWidth = width;
        if (suffix !== false && !suffix) {
            suffix = '...';
        }

        if (suffix) {
            truncateWidth = strUtil.getStrLen(suffix);
        }

        return strUtil.truncate(tmp, truncateWidth, opts.suffix);
    }

    // split to multiple rows
    var rows = [];
    while (tmp) {
        var result = strUtil.truncate(tmp, width, false);
        rows.push(
            doAlignValue(result, width - strUtil.getStrLen(result), alignment)
        );
        tmp = tmp.replace(result, '');
    }
    return rows;
}

exports.getSpaceStr = getSpaceStr;

exports.alignValue = alignValue;

/**
 * 对齐给定的值数组
 *
 * @param {Array.<string>} data 值数组
 * @param {string=} alignment 对齐方式，默认左对齐，可选，'left'|'right'|'center'
 * @param {Function=} format 自定义的格式化方法，对齐后调用，可选
 * @return {Array.<string>}
 */
exports.alignColumn = function (data, alignment, format) {
    var maxLen = 0;
    var lenArr = [];
    data.forEach(function (v, index) {
        var len = strUtil.getStrLen(String(v));
        lenArr[index] = len;
        if (len > maxLen) {
            maxLen = len;
        }
    });

    data = data.map(function (v, index) {
        v = alignValue(v, {
            width: maxLen,
            valueWidth: lenArr[index],
            alignment: alignment
        });

        if (typeof format === 'function') {
            v = format(v);
        }
        return v;
    });

    return data;
};

/**
 * 对齐表格数据
 *
 * @param {Array} data 二维数据
 * @param {Object=} colOptions 列选项，key 为列索引，value 为对应的列选项
 *        {
 *           alignment: 'left'|'right'|'center'，对齐方式
 *           width: 200, 列宽度，可选，默认列值最大宽度
 *           format: function, 自定义的格式化方法，对齐后调用
 *        }
 * @return {Array}
 */
exports.alignTable = function (data, colOptions) {
    var widthInfo = getColWidthInfo(data);
    var colMaxWidths = widthInfo.colMaxWidths;
    var valueWidthArr = widthInfo.valueWidthArr;

    colOptions || (colOptions = {});

    var result = [];
    var rLen = data.length;
    var cLen = rLen ? data[0].length : 0;
    var opts;
    for (var r = 0; r < rLen; r++) {
        var row = data[r];

        // 对齐列值
        var formatRow = [];
        var maxSplitRows = 1;
        for (var c = 0; c < cLen; c++) {
            opts = colOptions[c] || {};
            var tmp = formatRow[c] = alignValue(row[c], {
                alignment: opts.alignment,
                width: opts.width || colMaxWidths[c],
                valueWidth: valueWidthArr[c][r]
            });

            if (Array.isArray(tmp) && tmp.length > maxSplitRows) {
                maxSplitRows = tmp.length;
            }
        }

        // 扩展行
        for (r  = 0; r < maxSplitRows; r++) {
            var rowData = [];
            for (c = 0; c < cLen; c++) {
                opts = colOptions[c] || {};
                var value = formatRow[c];
                if (Array.isArray(value)) {
                    value = value[r];
                    if (value === undefined) {
                        value = exports.getSpaceStr(opts.width || colMaxWidths[c]);
                    }
                }
                rowData[c] = opts.format ? opts.format(value) : value;
            }
            result.push(rowData);
        }
    }

    return result;
};
