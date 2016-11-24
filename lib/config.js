/**
 * @file 组件包相关配置定义
 * @author sparklewhy@gmail.com
 */

var path = require('path');

/**
 * 获取临时目录
 *
 * @return {string}
 */
function getTempDir() {
    var list = ['FISX_PKG_CACHE_DIR', 'LOCALAPPDATA', 'APPDATA', 'HOME'];
    var tempDir;

    list.some(function (key) {
        return !!(tempDir = process.env[key]);
    });

    return tempDir || path.join(__dirname, '..', '.temp');
}

var config = {

    /**
     * 仓库类型常量定义
     *
     * @type {Object}
     */
    reposType: {
        GITHUB: 'github',
        GITLAB: 'gitlab',
        EDP: 'edp',
        NPM: 'npm',
        LOCAL: 'file',
        URL: 'url'
    },

    /**
     * 设置 log 工具
     *
     * @param {Object} log log 工具
     */
    set log(log) {
        this._log = log;
    },

    /**
     * 获取 log 工具
     *
     * @return {Object}
     */
    get log() {
        return this._log || require('./log');
    },

    /**
     * 获取缓存目录
     *
     * @return {string}
     */
    get cacheDir() {
        return this._cacheDir || path.join(getTempDir(), '.fisx-pkg-download');
    },

    /**
     * 设置缓存目录
     *
     * @param {string} dir 缓存目录
     */
    set cacheDir(dir) {
        this._cacheDir = dir;
    },

    /**
     * 设置 是否是 NPM install 命令
     *
     * @param {boolean} flag 是否是 npm install
     */
    set npmInstall(flag) {
        this._isNpmInstall = !!flag;
    },

    /**
     * 是否是 NPM 安装，如果是，等价于 npm install 命令
     *
     * @return {boolean}
     */
    get npmInstall() {
        return !!this._isNpmInstall;
    },

    /**
     * 设置默认安装的源
     *
     * @param {Object} endPoint 安装源
     * @param {string} endPoint.type 安装源的类型
     * @param {string} endPoint.value 安装源的值
     */
    set defaultEndPoint(endPoint) {
        this._endPoint = {
            type: endPoint.type,
            value: endPoint.value
        };
    },

    /**
     * 获取默认的安装源
     *
     * @return {{type: string, author: string}}
     */
    get defaultEndPoint() {
        return this._endPoint || {type: this.reposType.EDP};
    },

    /**
     * 设置 github 安装源的作者信息
     *
     * @param {string} author 要设置的作者信息
     */
    set defaultGitHubOwner(author) {
        this._githubOwner = author;
    },

    /**
     * 获取 github 安装源的作者信息
     *
     * @return {string}
     */
    get defaultGitHubOwner() {
        return this._githubOwner;
    },

    /**
     * 设置 gitlab 安装源的作者信息
     *
     * @param {string} author 要设置的作者信息
     */
    set defaultGitlabOwner(author) {
        this._gitlabOwner = author;
    },

    /**
     * 获取 gitlab 安装源的作者信息
     *
     * @return {string}
     */
    get defaultGitlabOwner() {
        return this._gitlabOwner;
    },

    /**
     * 设置 gitlab token
     *
     * @param {string} token 要设置的 token 信息
     */
    set defaultGitlabToken(token) {
        this._gitlabToken = token;
    },

    /**
     * 获取 gitlab token
     *
     * @return {string}
     */
    get defaultGitlabToken() {
        return this._gitlabToken;
    },

    /**
     * 设置 gitlab 默认 domain 信息
     *
     * @param {string} domain 要设置的 domain 信息, e.g., http://xx.gitlab.com
     */
    set defaultGitlabDomain(domain) {
        this._gitlabDomain = domain;
    },

    /**
     * 获取 github 默认 domain 信息
     *
     * @return {string}
     */
    get defaultGitlabDomain() {
        return this._gitlabDomain;
    },

    /**
     * 设置 edp 默认安装的源
     *
     * @param {string} url 安装源 url
     */
    set defaultEDPRegistry(url) {
        this._edpRegsitry = url;
    },

    /**
     * 获取 edp 默认安装的源 url
     *
     * @return {string}
     */
    get defaultEDPRegistry() {
        return this._edpRegsitry || 'http://edp-registry.baidu.com';
    },

    /**
     * 设置 npm 默认安装的源
     *
     * @param {string} url 安装源 url
     */
    set defaultNPMRegistry(url) {
        this._edpRegsitry = url;
    },

    /**
     * 获取 npm 默认安装的源 url
     *
     * @return {string}
     */
    get defaultNPMRegistry() {
        return this._edpRegsitry || 'http://registry.npmjs.org';
    },

    /**
     * 设置组件包安装目录
     *
     * @param {string} dir 安装的目录名称
     */
    set installDir(dir) {
        this._dir = dir;
    },

    /**
     * 获取组件包安装的目录
     *
     * @return {string}
     */
    get installDir() {
        return this._dir || 'dep';
    },

    /**
     * 设置保存的包依赖信息存储的目标 key 名称
     *
     * @param {string} key 保存的目标 key 名称
     */
    set saveTargetKey(key) {
        this._saveTarget = key;
    },

    /**
     * 获取保存到清单文件用来存储依赖信息的 key 名称，如果不存在，默认存储在顶层
     *
     * @return {string}
     */
    get saveTargetKey() {
        return this._saveTarget;
    },

    /**
     * 设置保存的模块配置信息存储的目标 key 名称
     *
     * @param {string} key 保存的目标 key 名称
     */
    set moduleConfigKey(key) {
        this._moduleConfig = key;
    },

    /**
     * 获取保存的模块配置信息存储的目标 key 名称
     *
     * @return {string}
     */
    get moduleConfigKey() {
        return this._moduleConfig || 'requireConfig';
    },

    /**
     * 设置保存的锁定模块配置信息存储的目标 key 名称
     *
     * @param {string} key 保存的目标 key 名称
     */
    set lockConfigKey(key) {
        this._lockConfig = key;
    },

    /**
     * 获取保存的锁定模块配置信息存储的目标 key 名称
     *
     * @return {string}
     */
    get lockConfigKey() {
        return this._lockConfig || 'lock';
    },

    /**
     * 设置保存项目安装依赖信息的清单文件信息
     *
     * @param {string} file 文件名称, e.g., `bower.json`
     */
    set manifestFile(file) {
        this._manifestFile = file;
    },

    /**
     * 获取清单文件
     *
     * @return {string}
     */
    get manifestFile() {
        return this._manifestFile || 'package.json';
    },

    /**
     * 初始化自定义的配置
     *
     * @param {Object} config 配置对象，需要实现 `get` 接口，配置信息存储在
     *        `component.<option>` key
     */
    initConfig: function (config) {
        var options = [
            'cacheDir', 'defaultEndPoint', 'defaultGitHubOwner',
            'installDir', 'defaultEDPRegistry', 'defaultNPMRegistry',
            'saveTargetKey', 'manifestFile', 'moduleConfigKey',
            'defaultGitlabOwner', 'defaultGitlabDomain', 'defaultGitlabToken'
        ];
        options.forEach(function (opt) {
            var value = config.get('component.' + opt);
            if (value != null) {
                this[opt] = value;
            }
        }, this);
    }

};

module.exports = exports = config;
