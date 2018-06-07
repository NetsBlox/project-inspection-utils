describe('action', function() {
    const Action = require('../../src/action');
    const assert = require('assert');
    const nested = require('../fixtures/nested-action');
    let action = null;

    beforeEach(() => action = new Action(nested));

    describe('findIds', function() {
        let ids = null;

        before(function() {
            const action = new Action(nested);
            ids = action.getReferencedIDs();
        });

        it('should find ids in nested actions', function() {
            assert(ids.item_1);
        });

        it('should find ids in targets within nested actions', function() {
            assert.deepEqual(ids.item_0[1], [2, 1]);
        });

        it('should find ids in targets', function() {
            assert.deepEqual(ids.item_0[0], [1]);
        });

        it('should find ids in sub-arrays', function() {
            assert.deepEqual(ids.item_2, [[ 3, 0 ]]);
        });
    });

    describe('getValueFromPath', function() {
        it('should be able to traverse nested actions', function() {
            const action = new Action(nested);
            assert.equal(action.getIdFromPath([2, 0]), 'item_1')
        });
    });

    describe('setArgByPath', function() {
        it('should be able to set args of nested actions', function() {
            const newId = 'item_48';
            action.setArgByPath([2, 1], newId);
            assert.equal(action.getIdFromPath([2, 1]), newId);
        });
    });

    describe('getExpectedTagNames', function() {
        it('should accept sprites for the second arg', function() {
            const tags = action.getExpectedTagNames([[1]]);
            assert(tags.includes('block'));
        });
    });

    // Check that it updates the undo content of removeBlock, moveBlock (59)
    // TODO
});
