var expect = require('expect.js');
var semver = require('../../lib/repos/semver');

describe('semver', function () {
    it('should not conflict', function () {
        expect(semver.isConflict('3.1.0-rc.2', '3.1.0-rc.2')).to.be(false);
        expect(semver.isConflict('1.8.5', '1.5.2')).to.be(false);
    });
});
