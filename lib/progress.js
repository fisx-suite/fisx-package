/**
 * @file 显示进度工具方法
 * @author sparklewhy@gmail.com
 */

var ProgressBar = require('progress');
var SimpleTick = require('./tick');

/**
 * 创建进度条
 *
 * @param {EventEmitter} target 要监听进度的目标对象，需要发射 `progress` `end` 事件
 * @return {{done: Function}}
 */
function createProgressBar(target) {
    var bar;
    target.on('progress', function (progress) {
        var total = progress.total;
        if (total && process.stderr.isTTY) {
            bar = bar
            || new ProgressBar(
                'downloading `' + target + '` [:bar] :percent :etas - :elapseds',
                {
                    complete: '=',
                    incomplete: ' ',
                    width: 20,
                    total: total,
                    clear: true
                }
            );
            bar.update(progress.percent);
        }
        else {
            bar = bar || new SimpleTick('downloading `' + target + '` ');
            bar.tick();
        }
    });

    var doneHandler = function (cd) {
        if (bar instanceof SimpleTick) {
            bar.clear();
        }
        else if (bar instanceof ProgressBar) {
            bar.terminate();
        }
        bar = null;
    };

    target.on('end', doneHandler);

    return {
        done: doneHandler
    };
}

/**
 * 显示加载中状态
 *
 * @param {string} tip 加载中提示话术
 * @param {number=} interval 加载中动画刷新频率，可选，默认 60
 * @return {{hide: Function}}
 */
createProgressBar.show = function (tip, interval) {
    var loading = new SimpleTick(tip, {
        keepAlive: true,
        interval: interval || 60
    });

    return {
        hide: function () {
            loading.clear();
            loading = null;
        }
    };
};

module.exports = exports = createProgressBar;
