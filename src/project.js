const Action = require('./action');
const MigrationRegistry = require('./migration-registry');
const XML_Element = require('../lib/snap/xml');
const inquirer = require('inquirer');

class Project {
    constructor(text) {
        this.element = new XML_Element();
        this.element.parseString(text);
    }

    repair() {
        if (this.element.tag === 'room') {
            return this.element.children
                .reduce((promise, child) => {
                    const project = child.childNamed('project');
                    return promise.then(() => this.checkProjectReplay(project));
                }, Promise.resolve())
        }
        return Promise.resolve();
    }

    checkProjectReplay(element) {
        const allActions = this.getProjectReplay(element);
        const events = allActions
            .filter(event => !event.isUserAction)
            .map(data => new Action(data));

        if (this.hasResetEventIds(events)) {
            console.log('detected a reset of action ids in the project!');
            return this.repairProjectReplay(events)
                .then(() => {  // save the events!
                    const eventXML = events.map(event => event.toXML()).join('');
                    const replayStr = `<replay>${eventXML}</replay>`;

                    // replace the replay node with this one!
                    // Remove the old replay
                    const oldReplay = element.childNamed('replay');
                    element.removeChild(oldReplay);

                    // add the new replay
                    let replay = new XML_Element(null, null, element);
                    replay.parseString(replayStr);
                    return replay;
                })
        }
        //const eventIds = events.map(ev => ev.id);
        return events;
    }

    getProjectReplay(element) {
        const replay = element.childNamed('replay');

        return replay.children.map(xml => {
            const keys = Object.keys(xml.attributes);
            const args = xml.children.map(child => this.loadEventArg(child));

            return {
                id: +xml.attributes.id,
                type: xml.attributes.type,
                replayType: +xml.attributes.replayType,
                time: +xml.attributes.time,
                user: xml.attributes.user,
                username: xml.attributes.username || undefined,
                isUserAction: xml.attributes.isUserAction === 'true',
                args: args
            };

        });
    }

    loadEventArg (xml) {
        var content,
            child,
            isArrayLike,
            tag,
            largestIndex = -1;

        if (xml.children.length) {
            if (xml.children[0].tag === 'CDATA') {
                return xml.children[0].contents.replace(/&ncdata;]>/g, ']]>');
            }

            content = {};
            isArrayLike = true;

            for (var i = xml.children.length; i--;) {
                child = xml.children[i];
                tag = child.tag[0] === '_' ? child.tag.slice(1) : child.tag;
                if (isNaN(+tag)) {
                    isArrayLike = false;
                }
                if (content[tag] instanceof Array) {
                    content[tag].unshift(this.loadEventArg(child));
                } else if (content[tag]) {
                    content[tag] = [this.loadEventArg(child), content[tag]];
                } else {
                    content[tag] = this.loadEventArg(child);
                }
                if (isArrayLike) {
                    largestIndex = Math.max(largestIndex, +tag);
                }
            }

            if (isArrayLike) {
                content.length = largestIndex + 1;
                content = Array.prototype.slice.call(content);
            }

            return content;
        } else {
            return xml.contents;
        }
    }

    hasResetEventIds(events) {
        for (let i = 0; i < events.length-1; i++) {
            if (events[i].getId() > events[i+1].getId()) {
                return true;
            }
        }
        return false;
    }

    repairProjectReplay(events) {
        const type = events[0].getType();
        if (type !== 'openProject') {
            console.error(`Invalid starting event: ${type}`);
            return;
        }

        const xml = events[0].getArg(0);
        // look up the existing ones from either earlier actions or the initial xml
        const changedIds = new MigrationRegistry();
        const itemsById = {};
        this.getItemsFromXml(xml).forEach(pair => {
            const [id, item] = pair;
            itemsById[id] = item;
            changedIds.preserve(id);
        });


        // For each of the items, check if the id is ambiguous.
        // If so, prompt the user about which it belongs to
        let actualIndex = events[1];
        let i = 1;
        let currentId = -1;
        return events
            .reduce((promise, event) => {
                return promise.then(() => {
                    const lastId = currentId;
                    currentId = event.getId();
                    if (event.getId() < lastId + 1) {
                        const newId = lastId + 1;


                        const updates = event.setId(newId);
                        currentId = event.getId();
                        // Record any ambiguities and the xml for each id
                        updates.forEach(tuple => {
                            const [prevId, id, xml] = tuple;
                            changedIds.record(prevId, id);
                            itemsById[id] = xml;
                        });

                        // Get the referenced IDs by this event
                        return this.resolveReferencedIDs(event, changedIds, itemsById);
                    }
                });
            }, Promise.resolve())
            .then(() => console.log(changedIds.ids))
            .then(() => events)
            .catch(err => console.error(err));
    }

    resolveReferencedIDs(event, changedIds, itemsById) {
        // For each referenced id, prompt the user to resolve
        const indicesForId = event.getReferencedIDs();
        const ids = Object.keys(indicesForId);

        return ids.reduce((promise, id) => {
            return promise.then(() => {
                const paths = indicesForId[id];

                let options = changedIds.get(id);
                let baseIds = options.map(id => id.split('/')[0]);
                let xmls = baseIds.map(id => itemsById[id]);
                const tagnames = xmls.map(xml => this.getTagName(xml));
                const expectedTagNames = event.getExpectedTagNames(paths);

                // Filter the options by expected type
                if (expectedTagNames.length) {
                    options = options.filter((_, i) => {
                        const tagname = tagnames[i];
                        return expectedTagNames.includes(tagname);
                    });
                    baseIds = options.map(id => id.split('/')[0]);
                    xmls = baseIds.map(id => itemsById[id]);
                }

                const isAmbiguous = options.length > 1;

                if (isAmbiguous) {
                    // Ask the user which id should be used
                    // (Use the last one by default)
                    const info = {
                        baseIds, 
                        xmls,
                        paths,
                        event
                    };
                    return this.selectOption(options, info)
                        .then(itemId => {
                            // Update the given arg
                            paths.forEach(path => event.setArgByPath(path, itemId));
                            console.log('updated event:');
                            console.log(event.pretty());
                        });
                }

                if (expectedTagNames.length) {
                    console.log(
                        'resolved block id automatically for event',
                        event.getId(),
                        options[0],
                        '(expected',
                        expectedTagNames.join(' or ') + ')'
                    );
                }
                paths.forEach(path => event.setArgByPath(path, options[0]));
            });
        }, Promise.resolve());
    }

    selectOption(ids, info) {
        console.log('>>>>>>> using default selector');
        return Promise.resolve(ids[0]);
    }

    getTagName(xml) {
        return xml.split(' ')[0].substring(1);
    }

    getItemsFromXml(xml) {
        const item = /\<[^>]*collabId="(item_\d*)"[^>]*\>/g;
        const pairs = [];
        let match = item.exec(xml);
        while (match) {
            pairs.push([match[1], match[0]]);
            match = item.exec(xml);
        }

        return pairs;
    }

    toString() {
        return this.element.toString();
    }
}

module.exports = Project;
