// @flow

import {
    Uniform1i,
    Uniform1f,
    Uniform2f,
    Uniform3f,
    UniformMatrix2f,
    UniformMatrix4f
} from '../uniform_binding.js';
import pixelsToTileUnits from '../../source/pixels_to_tile_units.js';

import type Context from '../../gl/context.js';
import type {UniformValues} from '../uniform_binding.js';
import type Transform from '../../geo/transform.js';
import type Tile from '../../source/tile.js';
import type LineStyleLayer from '../../style/style_layer/line_style_layer.js';
import type Painter from '../painter.js';
import type {CrossfadeParameters} from '../../style/evaluation_parameters.js';

export type LineUniformsType = {|
    'u_matrix': UniformMatrix4f,
    'u_pixels_to_tile_units': UniformMatrix2f,
    'u_device_pixel_ratio': Uniform1f,
    'u_units_to_pixels': Uniform2f,
    'u_dash_image': Uniform1i,
    'u_gradient_image': Uniform1i,
    'u_image_height': Uniform1f,
    'u_texsize': Uniform2f,
    'u_scale': Uniform3f,
    'u_mix': Uniform1f,
    'u_alpha_discard_threshold': Uniform1f,
    'u_trim_offset': Uniform2f
|};

export type LinePatternUniformsType = {|
    'u_matrix': UniformMatrix4f,
    'u_texsize': Uniform2f,
    'u_pixels_to_tile_units': UniformMatrix2f,
    'u_device_pixel_ratio': Uniform1f,
    'u_units_to_pixels': Uniform2f,
    'u_image': Uniform1i,
    'u_scale': Uniform3f,
    'u_fade': Uniform1f,
    'u_alpha_discard_threshold': Uniform1f
|};

export type LineDefinesType = 'RENDER_LINE_GRADIENT' | 'RENDER_LINE_DASH' | 'RENDER_LINE_ALPHA_DISCARD' | 'RENDER_LINE_TRIM_OFFSET';

const lineUniforms = (context: Context): LineUniformsType => ({
    'u_matrix': new UniformMatrix4f(context),
    'u_pixels_to_tile_units': new UniformMatrix2f(context),
    'u_device_pixel_ratio': new Uniform1f(context),
    'u_units_to_pixels': new Uniform2f(context),
    'u_dash_image': new Uniform1i(context),
    'u_gradient_image': new Uniform1i(context),
    'u_image_height': new Uniform1f(context),
    'u_texsize': new Uniform2f(context),
    'u_scale': new Uniform3f(context),
    'u_mix': new Uniform1f(context),
    'u_alpha_discard_threshold': new Uniform1f(context),
    'u_trim_offset': new Uniform2f(context)
});

const linePatternUniforms = (context: Context): LinePatternUniformsType => ({
    'u_matrix': new UniformMatrix4f(context),
    'u_texsize': new Uniform2f(context),
    'u_pixels_to_tile_units': new UniformMatrix2f(context),
    'u_device_pixel_ratio': new Uniform1f(context),
    'u_image': new Uniform1i(context),
    'u_units_to_pixels': new Uniform2f(context),
    'u_scale': new Uniform3f(context),
    'u_fade': new Uniform1f(context),
    'u_alpha_discard_threshold': new Uniform1f(context)
});

const lineUniformValues = (
    painter: Painter,
    tile: Tile,
    layer: LineStyleLayer,
    crossfade: CrossfadeParameters,
    matrix: ?Float32Array,
    imageHeight: number,
    pixelRatio: number,
    trimOffset: [number, number],
): UniformValues<LineUniformsType> => {
    const transform = painter.transform;
    const pixelsToTileUnits = transform.calculatePixelsToTileUnitsMatrix(tile);

    const values = {
        'u_matrix': calculateMatrix(painter, tile, layer, matrix),
        'u_pixels_to_tile_units': pixelsToTileUnits,
        'u_device_pixel_ratio': pixelRatio,
        'u_units_to_pixels': [
            1 / transform.pixelsToGLUnits[0],
            1 / transform.pixelsToGLUnits[1]
        ],
        'u_dash_image': 0,
        'u_gradient_image': 1,
        'u_image_height': imageHeight,
        'u_texsize': [0, 0],
        'u_scale': [0, 0, 0],
        'u_mix': 0,
        'u_alpha_discard_threshold': 0.0,
        'u_trim_offset': trimOffset
    };
    if (hasDash(layer)) {
        const tileZoomRatio = calculateTileRatio(tile, painter.transform);
        values['u_texsize'] = tile.lineAtlasTexture.size;
        values['u_scale'] = [tileZoomRatio, crossfade.fromScale, crossfade.toScale];
        values['u_mix'] = crossfade.t;
    }
    return values;
};

const linePatternUniformValues = (
    painter: Painter,
    tile: Tile,
    layer: LineStyleLayer,
    crossfade: CrossfadeParameters,
    matrix: ?Float32Array,
    pixelRatio: number
): UniformValues<LinePatternUniformsType> => {
    const transform = painter.transform;
    const tileZoomRatio = calculateTileRatio(tile, transform);
    return {
        'u_matrix': calculateMatrix(painter, tile, layer, matrix),
        'u_texsize': tile.imageAtlasTexture.size,
        // camera zoom ratio
        'u_pixels_to_tile_units': transform.calculatePixelsToTileUnitsMatrix(tile),
        'u_device_pixel_ratio': pixelRatio,
        'u_image': 0,
        'u_scale': [tileZoomRatio, crossfade.fromScale, crossfade.toScale],
        'u_fade': crossfade.t,
        'u_units_to_pixels': [
            1 / transform.pixelsToGLUnits[0],
            1 / transform.pixelsToGLUnits[1]
        ],
        'u_alpha_discard_threshold': 0.0
    };
};

function calculateTileRatio(tile: Tile, transform: Transform) {
    return 1 / pixelsToTileUnits(tile, 1, transform.tileZoom);
}

function calculateMatrix(painter, tile, layer, matrix) {
    return painter.translatePosMatrix(
        matrix ? matrix : tile.tileID.projMatrix,
        tile,
        layer.paint.get('line-translate'),
        layer.paint.get('line-translate-anchor')
    );
}

const lineDefinesValues = (layer: LineStyleLayer): LineDefinesType[] => {
    const values = [];
    if (hasDash(layer)) values.push('RENDER_LINE_DASH');
    if (layer.paint.get('line-gradient')) values.push('RENDER_LINE_GRADIENT');

    const trimOffset = layer.paint.get('line-trim-offset');
    if (trimOffset[0] !== 0 || trimOffset[1] !== 0) {
        values.push('RENDER_LINE_TRIM_OFFSET');
    }

    const hasPattern = layer.paint.get('line-pattern').constantOr((1: any));
    const hasOpacity = layer.paint.get('line-opacity').constantOr(1.0) !== 1.0;
    if (!hasPattern && hasOpacity) {
        values.push('RENDER_LINE_ALPHA_DISCARD');
    }
    return values;
};

function hasDash(layer) {
    const dashPropertyValue = layer.paint.get('line-dasharray').value;
    return dashPropertyValue.value || dashPropertyValue.kind !== "constant";
}

export {
    lineUniforms,
    linePatternUniforms,
    lineUniformValues,
    linePatternUniformValues,
    lineDefinesValues
};
