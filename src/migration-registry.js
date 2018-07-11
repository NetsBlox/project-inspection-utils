class MigrationRegistry {
    constructor() {
        this.ids = {};
    }

    preserve(id) {
        return this.record(id, id);
    }

    record(oldId, newId) {
        if (!this.ids[oldId]) {
            this.ids[oldId] = [];
        }

        if (!this.ids[oldId].includes(newId)) {
            this.ids[oldId].push(newId);
        }
    }

    isAmbiguous(id) {
        return this.ids[id] && this.ids[id].length > 1;
    }

    get(id) {
        const baseId = id.split('/')[0];
        const suffix = id.split('/').slice(1)
            .filter(chunk => !!chunk);
        return this.ids[baseId]
            .map(newId => [newId].concat(suffix).join('/'));
    }
}

module.exports = MigrationRegistry;
