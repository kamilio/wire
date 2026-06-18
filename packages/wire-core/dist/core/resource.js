function compareStrings(left, right) {
    const leftCodePoints = Array.from(left, (character) => character.codePointAt(0));
    const rightCodePoints = Array.from(right, (character) => character.codePointAt(0));
    const length = Math.min(leftCodePoints.length, rightCodePoints.length);
    for (let index = 0; index < length; index += 1) {
        const difference = leftCodePoints[index] - rightCodePoints[index];
        if (difference !== 0) {
            return difference;
        }
    }
    return leftCodePoints.length - rightCodePoints.length;
}
function cloneValue(value) {
    if (Array.isArray(value)) {
        return Object.freeze(value.map(cloneValue));
    }
    if (value !== null && typeof value === "object") {
        return cloneObject(value);
    }
    return value;
}
function cloneObject(value) {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)])));
}
export function resourceId(source) {
    return `${source.service}:${source.identifier}`;
}
export function normalizeResource(resource) {
    return Object.freeze({
        id: resource.id,
        type: resource.type,
        identifiers: Object.freeze(resource.identifiers
            .map((identifier) => Object.freeze({ service: identifier.service, identifier: identifier.identifier }))
            .sort((left, right) => compareStrings(left.service, right.service) || compareStrings(left.identifier, right.identifier))),
        urls: Object.freeze([...resource.urls].sort(compareStrings)),
        filesystem_links: Object.freeze(resource.filesystem_links
            .map((link) => Object.freeze({ path: link.path, role: link.role, data: cloneObject(link.data) }))
            .sort((left, right) => compareStrings(left.path, right.path) || compareStrings(left.role, right.role))),
        data: Object.freeze(resource.data
            .map((item) => Object.freeze({ namespace: item.namespace, key: item.key, value: cloneValue(item.value) }))
            .sort((left, right) => compareStrings(left.namespace, right.namespace) || compareStrings(left.key, right.key))),
        relationships: Object.freeze(resource.relationships
            .map((relationship) => Object.freeze({ target_id: relationship.target_id, type: relationship.type, data: cloneObject(relationship.data) }))
            .sort((left, right) => compareStrings(left.type, right.type) || compareStrings(left.target_id, right.target_id))),
    });
}
//# sourceMappingURL=resource.js.map