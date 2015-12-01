var expect = require('expect.js');
var Package = require('../../lib/package');

describe('Package', function () {
    it('should conver to Package', function () {
        var pkg = Package.toPackage('myer=er');

        expect(pkg instanceof Package).to.be(true);
        expect(pkg.name).to.eql('er');
        expect(pkg.aliasName).to.eql('myer');
        expect(pkg.endPoint).to.eql({type: 'edp'});


        pkg = Package.toPackage('http://edp-registry.baidu.com/er/-/er-3.0.0.tgz');

        expect(pkg instanceof Package).to.be(true);
        expect(pkg.name).to.be(undefined);
        expect(pkg.aliasName).to.be(undefined);
        expect(pkg.endPoint).to.eql({type: 'url', value: 'http://edp-registry.baidu.com/er/-/er-3.0.0.tgz'});
        expect(pkg.repos).to.not.be(undefined);
        expect(pkg.repos.url).to.be('http://edp-registry.baidu.com/er/-/er-3.0.0.tgz')


        pkg = Package.toPackage('github:wuhy/edp-build-versioning');
        expect(pkg instanceof Package).to.be(true);
        expect(pkg.name).to.be('edp-build-versioning');
        expect(pkg.aliasName).to.be(undefined);
        expect(pkg.endPoint).to.eql({type: 'github', value: 'wuhy'});
        expect(pkg.repos.owner).to.be('wuhy');
        expect(pkg.repos.pkgName).to.be('edp-build-versioning');


        var config = require('../../lib/config');
        config.defaultGitHubOwner = 'wuhy';
        pkg = Package.toPackage('github:edp-build-versioning');
        expect(pkg instanceof Package).to.be(true);
        expect(pkg.name).to.be('edp-build-versioning');
        expect(pkg.aliasName).to.be(undefined);
        expect(pkg.endPoint).to.eql({type: 'github'});
        expect(pkg.repos.owner).to.be('wuhy');
        expect(pkg.repos.pkgName).to.be('edp-build-versioning');
    });
});
