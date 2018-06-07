const XML_Element = require('../lib/snap/xml');

class Action {
    constructor(data) {
        this.data = data;
    }

    getArgs() {
        return this.data.args.slice();
    }

    getArg(index) {
        return this.data.args[index];
    }

    setArgByPath(path, value) {
        return this.setValueFromPath(this.data.args, path, value);
    }

    getType() {
        return this.data.type;
    }

    getId() {
        return this.data.id;
    }

    setId(id) {
        const oldId = this.getId();
        const newItemsWithIndex = this.getNewItems();

        this.data.id = id;

        // Update the ids of any created blocks
        return newItemsWithIndex.map(tuple => {
                const [item, index] = tuple;
                const updates = this.updateItemId(item, oldId-1, id);
                return updates.map(update => {
                    const [oldItemId, itemId, itemXml, xml] = update;

                    // Update the arg in the event
                    this.setArgByPath([index], xml);

                    return [oldItemId, itemId, itemXml];
                });
            })
            .reduce((l1, l2) => l1.concat(l2), []);
    }

    pretty() {
        const data = this.pick(['id', 'type', 'username', 'args'], this.data);
        return JSON.stringify(data, null, 2);
    }

    // Get new xml from the actions
    getNewItems() {
        const indices = [];
        switch(this.getType()) {
            case 'addBlock':
            case 'addCostume':
            case 'addSprite':
            case 'importBlocks':
            case 'importSprites':
                indices.push(0);
                break;

            case 'moveBlock':
                if (this.data.args[0][0] === '<') {
                    indices.push(0);
                }
                break;

            case 'addCustomBlock':
            case 'replaceBlock':  // second arg
            case 'ringify':  // second arg is an id
                indices.push(1);
                break;
        }

        return indices.map(i => [this.data.args[i], i]);
    }

    getReferencedIDs() {
        const indices = this.findIds([], this.data.args);
        const indicesForId = {};
        indices.forEach(index => {
            const id = this.getIdFromPath(index);
            if (!indicesForId[id]) {
                indicesForId[id] = [];
            }
            indicesForId[id].push(index);
        });

        return indicesForId;
    }

    //////////// Static methods ////////////
    updateItemId(xml, id, newId) {
        const idRegex = new RegExp('\\bitem_' + id + '([_\\d]*)\\b', 'g');
        const changedItems = [];
        xml = xml.replace(idRegex, function(match, suffix) {
            const oldId = `item_${id}${suffix}`;
            const itemId = `item_${newId}${suffix}`;
            changedItems.push([oldId, itemId]);
            return itemId;
        });

        // Get the matches
        return changedItems.map(pair => {
            const itemXml = this.getItemFromXml(pair[1], xml);
            pair.push(itemXml, xml);
            return pair;
        });
    }

    getItemFromXml(id, xml) {
        const regex = new RegExp(`\\<[^>]*collabId="${id}"[^>]*\\>`, 'g');
        return regex.exec(xml)[0];
    }

    getIdFromPath(path) {
        let data = this.data.args;
        data = this.getValueFromPath(data, path);
        if (typeof data === 'object') {
            return data.element;
        }
        return data;
    }

    getValueFromPath(data, path) {
        path.forEach(index => {
            if (!data) return;
            if (!Array.isArray(data)) {  // assume it must be an action
                data = data.args;
            }
            data = data[index];
        });

        return data;
    }

    findIds(prefixPath, list) {
        const indices = [];

        list.forEach((item, i) => {
            const isAction = typeof item === 'object' && item.type;

            if (typeof item === 'string' && item.startsWith('item_')) {
                indices.push(i);
            } else if (Array.isArray(item)) {
                const subpaths = this.findIds([i], item);
                indices.push.apply(indices, subpaths);
            } else if (typeof item === 'object' && item.element) {
                indices.push(i);
            } else if (isAction) {
                const subpaths = this.findIds([i], item.args);
                indices.push.apply(indices, subpaths);
            }
        });

        return indices.map(index => prefixPath.concat(index));
    }

    setValueFromPath(data, path, value) {
        const last = path.pop();
        path.forEach(index => {
            data = data[index];
            if (data && data.type) {  // data is an action
                data = data.args;
            }
        });

        const current = data[last];
        if (!current || typeof current === 'string') {
            data[last] = value;
        } else if (typeof current.element === 'string'){
            data[last].element = value;
        } else {
            throw new Error('Unrecognized arg value: ', current);
        }
        return data;
    }

    pick(keys, obj) {
        const result = {};
        keys.forEach(key => result[key] = obj[key]);
        return result;
    }

    getExpectedTagNames (paths) {
        const type = this.getType();
        const tags = this.intersect(
            paths
                .map(path => this.getValueFromPath(Action.EXPECTED_TYPES[type], path))
                .reduce((l1, l2) => l1.concat(l2), [])
        );

        return uniq(tags.filter(tag => !!tag));
    }

    intersect() {
        const intersection = [];
        const lists = Array.prototype.slice.call(arguments);
        for (let i = lists[0].length; i--;) {
            let item = lists[0][i];
            let isInAll = true;
            for (let l = lists.length; l--;) {
                isInAll = isInAll && lists[l].includes(item);
            }
            if (isInAll) {
                intersection.push(item);
            }
        }
        return intersection;
    }

    toXML() {
        const data = this.data;
        const args = data.args.map(arg => this.getArgumentXML('arg', arg));
        const xml = this.format(
            '<event id="@" type="@" replayType="@" time="@" user="@" username="@" isUserAction="@">%</event>',
            data.id,
            data.type,
            data.replayType || 0,
            data.time,
            data.user,
            data.username || '',
            data.isUserAction || false,
            args
        );

        return xml;
    }

    getArgumentXML (tag, item) {
        var myself = this,
            xml = item;

        if (item instanceof Object) {
            var keys = Object.keys(item);

            xml = keys.map(function(key) {
                if (item[key] instanceof Array) {
                    return item[key].map(function(el) {
                        // prefix index with '_' since xml can't start with a number
                        return myself.getArgumentXML('_' + key, el);
                    }).join('');
                } else {
                    if (/^[^a-zA-Z].*/.test(key)) {
                        return myself.getArgumentXML('_' + key, item[key]);
                    }
                    return myself.getArgumentXML(key, item[key]);
                }
            }).join('');

        } else if (typeof item === 'string' && item[0] === '<') {
            xml = '<![CDATA[' + item.replace(/]]>/g, '&ncdata;]>') + ']]>';
        }

        return [
            '<', tag, '>',
            xml,
            '</', tag, '>'
        ].join('');
    }

    format (string) {  // This is adapted from Snap
        // private
        var myself = this,
            i = -1,
            values = arguments,
            value;

        return string.replace(/[@$%]([\d]+)?/g, function (spec, index) {
            index = parseInt(index, 10);

            if (isNaN(index)) {
                i += 1;
                value = values[i + 1];
            } else {
                value = values[index + 1];
            }
            // original line of code - now frowned upon by JSLint:
            // value = values[(isNaN(index) ? (i += 1) : index) + 1];

            return spec === '@' ?
                    myself.escape(value)
                        : spec === '$' ?
                            myself.escape(value, true)
                                : value;
        });
    }
}

Action.prototype.escape = XML_Element.prototype.escape;

const BLOCK = ['block'];
const OWNER = ['stage', 'sprite'];
Action.EXPECTED_TYPES = {
    addBlock: [BLOCK, OWNER],
    moveBlock: [BLOCK, BLOCK],
    setBlockPosition: [BLOCK, null, null, BLOCK]
};

function uniq(list) {
    const results = [];
    list.forEach(item => {
        if (!results.includes(item)) {
            results.push(item);
        }
    });
    return results;
}

module.exports = Action;
