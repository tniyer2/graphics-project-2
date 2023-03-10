// Checkers Game using WebGL
// AUTHORS: 
'use strict';
    
// Global WebGL context variable
let gl;

////////// Constants //////////
// Feel free to use any of these that you wish, or not use them, or change them

// Drawing Sizes
const SQUARE_SZ = 2/8; // 8 boxes across, screen is 2 units wide (from -1 to 1)
const PIECE_RADIUS = SQUARE_SZ/2 * 0.8; // make the radius a little smaller than a square so it fits inside

// Basic Colors
const WHITE = [1.0, 1.0, 1.0, 1.0];
const BLACK = [0.0, 0.0, 0.0, 1.0];

// Square Colors
const DARK_SQUARE = [0.82, 0.55, 0.28, 1.0];
const LIGHT_SQUARE = [1.0, 0.89, 0.67, 1.0];

// Player Colors
const PLAYER_1 = [0.7, 0.0, 0.0, 1.0]; // red
const PLAYER_2 = [0.8, 0.8, 0.8, 1.0]; // light-gray
const PLAYER_1_HIGHLIGHT = [0.8, 0.3, 0.3, 1.0]; // lighter red
const PLAYER_2_HIGHLIGHT = [0.9, 0.9, 0.9, 1.0]; // lighter gray

// Other Colors
const BORDER_CURRENT_TURN = [0.0, 0.0, 0.0, 1.0];
const POTENTIAL_PIECE = [1.0, 1.0, 0.6, 1.0];

// The possible states for any square on the game board
const NO_PIECE = 0;
const BLACK_PIECE = 1;
const WHITE_PIECE = 2;
const BLACK_HILIGHT = 3;
const WHITE_HILIGHT = 4;
const BLACK_KING = 5;
const WHITE_KING = 6;
const BLACK_KING_HILIGHT = 7;
const WHITE_KING_HILIGHT = 8;
const POTENTIAL = 9;
const POTENTIAL_KING = 10;
const BLACKS = [BLACK_PIECE, BLACK_HILIGHT, BLACK_KING, BLACK_KING_HILIGHT];
const WHITES = [WHITE_PIECE, WHITE_HILIGHT, WHITE_KING, WHITE_KING_HILIGHT];
const KINGS = [BLACK_KING, BLACK_KING_HILIGHT, WHITE_KING, WHITE_KING_HILIGHT, POTENTIAL_KING];
const HILIGHTS = [BLACK_HILIGHT, BLACK_KING_HILIGHT, WHITE_HILIGHT, WHITE_KING_HILIGHT];

function create_starting_board() {
    return [
        [BLACK_PIECE, BLACK_PIECE, BLACK_PIECE, BLACK_PIECE],
        [BLACK_PIECE, BLACK_PIECE, BLACK_PIECE, BLACK_PIECE],
        [BLACK_PIECE, BLACK_PIECE, BLACK_PIECE, BLACK_PIECE],
        [NO_PIECE, NO_PIECE, NO_PIECE, NO_PIECE],
        [NO_PIECE, NO_PIECE, NO_PIECE, NO_PIECE],
        [WHITE_PIECE, WHITE_PIECE, WHITE_PIECE, WHITE_PIECE],
        [WHITE_PIECE, WHITE_PIECE, WHITE_PIECE, WHITE_PIECE],
        [WHITE_PIECE, WHITE_PIECE, WHITE_PIECE, WHITE_PIECE],
    ];
}

// Initialize the game board
const GLB_board = create_starting_board();

// Start with BLACK's turn
let turn = BLACK_PIECE;
let hilighted_piece = null;


// Once the document is fully loaded run this init function.
window.addEventListener('load', function init() {
    // Get the HTML5 canvas object from it's ID
    const canvas = document.getElementById('webgl-canvas');
    if (!canvas) { window.alert('Could not find #webgl-canvas'); return; }

    // Get the WebGL context (save into a global variable)
    gl = canvas.getContext('webgl2');
    if (!gl) { window.alert("WebGL isn't available"); return; }

    // Configure WebGL
    gl.viewport(0, 0, canvas.width, canvas.height); // this is the region of the canvas we want to draw on (all of it)
    gl.clearColor(...LIGHT_SQUARE); // setup the background color

    // Initialize the WebGL program and data
    gl.program = initProgram();
    initBuffers();
    initEvents();

    // Render the static scene
    render();
});


/**
 * Initializes the WebGL program.
 */
function initProgram() {
    // Compile shaders
    // Vertex Shader
    let vert_shader = compileShader(gl, gl.VERTEX_SHADER,
        `#version 300 es
        precision mediump float;

        uniform mat4 uModelMatrix;

        in vec4 aPosition;
        
        void main() {
            gl_Position = uModelMatrix * aPosition;
        }`
    );
    // Fragment Shader
    let frag_shader = compileShader(gl, gl.FRAGMENT_SHADER,
        `#version 300 es
        precision mediump float;

        out vec4 fragColor;

        void main() {
            fragColor = vec4(1, 0, 0, 1);
        }`
    );

    // Link the shaders into a program and use them with the WebGL context
    let program = linkProgram(gl, vert_shader, frag_shader);
    gl.useProgram(program);
    
    // Get the attribute indices
    program.aPosition = gl.getAttribLocation(program, 'aPosition'); // get the vertex shader attribute "aPosition"
    program.uModelMatrix = gl.getUniformLocation(program, 'uModelMatrix');

    return program;
}


/**
 * Initialize the data buffers.
 */
function initBuffers() {
    gl.square = {};

    gl.square.vao = gl.createVertexArray();
    gl.bindVertexArray(gl.square.vao);

    const coords = [-1, 1, -1, -1, 1, -1, -1, 1, 1, -1, 1, 1];
    
    // Load the coordinate data into the GPU and associate with shader
    gl.square.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.square.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from(coords), gl.STATIC_DRAW);
    gl.vertexAttribPointer(gl.program.aPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(gl.program.aPosition);

    // Cleanup
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
}


/**
 * Initialize event handlers
 */
function initEvents() {
}

function iterateBoard(board, callback) {
    for (let i = 0; i < 8; ++i) {
        const rowStartsWithLight = i % 2 === 0; // first row is light
        for (let j = 0; j < 8; ++j) {
            const isEvenColumn = (j % 2 === 0)
            const isSquareDark = rowStartsWithLight !== isEvenColumn;
            callback(i, j, rowStartsWithLight, isSquareDark);
        }
    }
}

/**
 * Render the scene. Uses loop(s) to to go over the entire board and render each square and piece.
 * The light squares (which cannot have pieces on them) are not directly done here but instead by
 * the clear color.
 */
function render() {
    gl.clear(gl.COLOR_BUFFER_BIT);

    iterateBoard(GLB_board, function(row_i, col_i, rowStartsWithLight, isSquareDark) {
        if (isSquareDark) {
            let size = 1/8;

            let translateX = size * (-7 + (col_i * 2));
            let translateY = size * (7 - (row_i * 2));
            let a = glMatrix.mat4.fromTranslation(glMatrix.mat4.create(), [translateX, translateY, 0]);
            let b = glMatrix.mat4.fromScaling(glMatrix.mat4.create(), [size, size, size]);
            let c = glMatrix.mat4.multiply(glMatrix.mat4.create(), a, b);
            gl.uniformMatrix4fv(gl.program.uModelMatrix, false, c);
            renderSquare(false);
        }
    })
}

function renderSquare(isLight) {
    gl.bindVertexArray(gl.square.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
}

function reset_potentials() {
    /**
     * Sets POTENTIAL* spaces to NO_PIECE and *_HILIGHT to the non-hilight versions. Also clears
     * the hilighted_piece variable.
     */
    for (let i = 0; i < GLB_board.length; ++i) {
        let row = GLB_board[i];
        for (let j = 0; j < row.length; ++j) {
            if (row[j] === POTENTIAL || row[j] === POTENTIAL_KING) {
                row[j] = NO_PIECE;
            } else if (row[j] === BLACK_HILIGHT) {
                row[j] = BLACK_PIECE;
            } else if (row[j] === WHITE_HILIGHT) {
                row[j] = WHITE_PIECE;
            } else if (row[j] === BLACK_KING_HILIGHT) {
                row[j] = BLACK_KING;
            } else if (row[j] === WHITE_KING_HILIGHT) {
                row[j] = WHITE_KING;
            }
        }
    }
    hilighted_piece = null;
}
