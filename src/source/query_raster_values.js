// @flow

import type SourceCache from "./source_cache.js";
import type StyleLayer from "../style/style_layer.js";
import type CollisionIndex from "../symbol/collision_index.js";
import type Transform from "../geo/transform.js";
import type { RetainedQueryData } from "../symbol/placement.js";
import type { FilterSpecification } from "../style-spec/types.js";
import type { QueryGeometry } from "../style/query_geometry.js";
import assert from "assert";
import { mat4 } from "gl-matrix";

import type Point from "@mapbox/point-geometry";
import type { QueryResult } from "../data/feature_index.js";
import type { QueryFeature } from "../util/vectortile_to_geojson.js";

/*
 * Returns a matrix that can be used to convert from tile coordinates to viewport pixel coordinates.
 */
function getPixelPosMatrix(transform, tileID) {
    const t = mat4.identity([]);
    mat4.scale(t, t, [transform.width * 0.5, -transform.height * 0.5, 1]);
    mat4.translate(t, t, [1, -1, 0]);
    mat4.multiply(t, t, transform.calculateProjMatrix(tileID.toUnwrapped()));
    return Float32Array.from(t);
}

export function queryRasterSource(
    sourceCache: SourceCache,
    styleLayers: { [_: string]: StyleLayer },
    serializedLayers: { [_: string]: Object },
    queryGeometry: QueryGeometry,
    params: {
        filter: FilterSpecification,
        layers: Array<string>,
        availableImages: Array<string>,
    },
    transform: Transform,
    use3DQuery: boolean,
    visualizeQueryGeometry: boolean = false
): QueryResult {
    const tileResults = sourceCache.tilesIn(
        queryGeometry,
        use3DQuery,
        visualizeQueryGeometry
    );
    tileResults.sort(sortTilesIn);
    const results = [];
    for (const tileResult of tileResults) {
        results.push({
            wrappedTileID: tileResult.tile.tileID.wrapped().key,
            queryResults: tileResult.tile.queryRasterValues(
                styleLayers,
                serializedLayers,
                sourceCache._state,
                tileResult,
                params,
                transform,
                getPixelPosMatrix(
                    sourceCache.transform,
                    tileResult.tile.tileID
                ),
                visualizeQueryGeometry
            ),
        });
    }

    return results;
}

function sortTilesIn(a, b) {
    const idA = a.tileID;
    const idB = b.tileID;
    return (
        idA.overscaledZ - idB.overscaledZ ||
        idA.canonical.y - idB.canonical.y ||
        idA.wrap - idB.wrap ||
        idA.canonical.x - idB.canonical.x
    );
}
