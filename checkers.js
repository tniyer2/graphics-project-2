// Checkers Game using WebGL
// AUTHORS: Tanishq Iyer, Bryan Cohen
'use strict';

////////// Constants //////////
// Feel free to use any of these that you wish, or not use them, or change them

// Drawing Sizes
const SQUARE_SIZE = 1 / 8; // 8 boxes across, screen is 2 units wide (from -1 to 1)
const PIECE_RADIUS = (SQUARE_SIZE * 0.8) / 2; // make the radius a little smaller than a square so it fits inside

// Square Colors
const DARK_SQUARE_COLOR = [0.82, 0.55, 0.28, 1.0];
const LIGHT_SQUARE_COLOR = [1.0, 0.89, 0.67, 1.0];

// Player Colors
const PLAYER_1_PIECE_COLOR = [0.7, 0.0, 0.0, 1.0]; // red
const PLAYER_2_PIECE_COLOR = [0.8, 0.8, 0.8, 1.0]; // gray
const PLAYER_1_PIECE_HIGHLIGHT_COLOR = [0.8, 0.3, 0.3, 1.0]; // lighter red
const PLAYER_2_PIECE_HIGHLIGHT_COLOR = [0.9, 0.9, 0.9, 1.0]; // lighter gray

const PIECE_COLORS = [
    [ PLAYER_1_PIECE_COLOR, PLAYER_1_PIECE_HIGHLIGHT_COLOR ],
    [ PLAYER_2_PIECE_COLOR, PLAYER_2_PIECE_HIGHLIGHT_COLOR ]
];

// Other Colors
const BORDER_CURRENT_TURN_COLOR = [0.0, 0.0, 0.0, 1.0];
const POTENTIAL_PIECE_COLOR = [1.0, 1.0, 0.6, 1.0];

// The possible states for any square on the game board
const ALWAYS_EMPTY = -1;
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
const BLACKS = [ BLACK_PIECE, BLACK_HILIGHT, BLACK_KING, BLACK_KING_HILIGHT ];
const WHITES = [ WHITE_PIECE, WHITE_HILIGHT, WHITE_KING, WHITE_KING_HILIGHT ];
const KINGS = [ BLACK_KING, BLACK_KING_HILIGHT, WHITE_KING, WHITE_KING_HILIGHT, POTENTIAL_KING ];
const HIGHLIGHTS = [ BLACK_HILIGHT, BLACK_KING_HILIGHT, WHITE_HILIGHT, WHITE_KING_HILIGHT ];


function create_starting_game_state() {
    const createRow = (type, offset) => Array(4).fill()
        .flatMap(() => offset ? [ ALWAYS_EMPTY, type ] : [ type, ALWAYS_EMPTY ]);

    return {
        // Start with player 1's (black) turn
        players_turn: 1,
        highlighted_piece: null,
        board: [
            createRow(BLACK_PIECE, true),
            createRow(BLACK_PIECE, false),
            createRow(BLACK_PIECE, true),
            createRow(NO_PIECE,    false),
            createRow(NO_PIECE,    true),
            createRow(WHITE_PIECE, false),
            createRow(WHITE_PIECE, true),
            createRow(WHITE_PIECE, false)
        ]
    };
}


// Global WebGL context variable
let gl;

// Initialize the game board
let GLB_gameState = create_starting_game_state();


// Once the document is fully loaded run this init function.
window.addEventListener('load', function init() {
    // Get the HTML5 canvas object from it's ID
    const canvas = document.getElementById('webgl-canvas');
    if (!canvas) { window.alert('Could not find #webgl-canvas'); return; }

    // Get the WebGL context (save into a global variable)
    gl = canvas.getContext('webgl2');
    if (!gl) { window.alert("WebGL isn't available"); return; }

    // Configure WebGL
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(...LIGHT_SQUARE_COLOR);

    // Initialize the WebGL program and data
    gl.program = initProgram();
    initBuffers();

    // Render the static scene
    render();

    initEvents();
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
        uniform vec4 uColor;

        void main() {
            fragColor = uColor;
        }`
    );

    // Link the shaders into a program and use them with the WebGL context
    let program = linkProgram(gl, vert_shader, frag_shader);
    gl.useProgram(program);
    
    // Get the attribute indices
    program.aPosition = gl.getAttribLocation(program, 'aPosition'); // get the vertex shader attribute "aPosition"
    program.uModelMatrix = gl.getUniformLocation(program, 'uModelMatrix');

    program.uColor = gl.getUniformLocation(program, 'uColor');

    return program;
}


/**
 * Initialize the data buffers.
 */
function initBuffers() {
    const squareCoords = [-1, 1, -1, -1, 1, -1, -1, 1, 1, -1, 1, 1];
    gl.square = load2DModel(squareCoords);

    
    const circleCoords = makeCircleCoords(0, 0, 1, 64);

    gl.circle = load2DModel(circleCoords);
    
}


function load2DModel(coords) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    
    // Load the coordinate data into the GPU and associate with shader
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from(coords), gl.STATIC_DRAW);
    gl.vertexAttribPointer(gl.program.aPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(gl.program.aPosition);

    // Cleanup
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    return {
        vao: vao,
        positionBuffer: positionBuffer,
        numPoints: coords.length / 2
    };
}


/**
 * Initialize event handlers
 */
function initEvents() {
    gl.canvas.addEventListener('click', onClick);
}

function iterateBoard(board, callback) {
    for (let i = 0; i < 8; ++i) {
        const rowStartsWithLight = i % 2 === 0; // first row is light
        for (let j = 0; j < 8; ++j) {
            const isEvenColumn = (j % 2 === 0)
            const isSquareDark = rowStartsWithLight !== isEvenColumn;
            callback(i, j, isSquareDark);
        }
    }
}

function isSquareTypeIn(value, arr) {
    return arr.indexOf(value) !== -1;
}

function isSquareHighlighted(squareX, squareY) {
    const h = GLB_gameState.highlighted_piece;
    return h !== null && h.x === squareX && h.y === squareY;
}

/**
 * Render the scene. Uses loop(s) to to go over the entire board and render each square and piece.
 * The light squares (which cannot have pieces on them) are not directly done here but instead by
 * the clear color.
 */
function render() {
    // Clear the current rendering
    gl.clear(gl.COLOR_BUFFER_BIT);

    iterateBoard(GLB_gameState.board, (row, col, isSquareDark) => {
        if (isSquareDark === true) {
            const modelMatrix = calcMatrixForSquare(row, col);

            renderSquare(isSquareDark, modelMatrix);

            const squareValue = GLB_gameState.board[row][col];

            if (squareValue !== NO_PIECE) {
                const squareIsHighlighted = isSquareHighlighted(row, col);
                
                renderPiece(
                    isSquareTypeIn(squareValue, BLACKS),
                    squareIsHighlighted,
                    modelMatrix);
            }
        }
    });    
}

function calcMatrixForSquare(row, col) {
    let tx = SQUARE_SIZE * (-7 + (col * 2));
    let ty = SQUARE_SIZE * (7 - (row * 2));

    let t = glMatrix.mat4.fromTranslation(
        glMatrix.mat4.create(),
        [ tx, ty, 0 ]);

    let s = glMatrix.mat4.fromScaling(
        glMatrix.mat4.create(),
        Array(3).fill(SQUARE_SIZE));

    return glMatrix.mat4.multiply(glMatrix.mat4.create(), t, s);
}

/**
 * Renders the squares for checkers board.
 * 
 */
function renderSquare(isSquareDark, modelMatrix) {
    const color = isSquareDark ? DARK_SQUARE_COLOR : LIGHT_SQUARE_COLOR;

    gl.uniform4fv(gl.program.uColor, Float32Array.from(color));
    gl.uniformMatrix4fv(gl.program.uModelMatrix, false, modelMatrix);

    gl.bindVertexArray(gl.square.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
}

function checkBoolean(a) {
    if (typeof a !== "boolean") {
        throw new Error("Invalid type, not a boolean: " + String(a));
    }
}

/**
 * Renders a circle for the piece.
 */
function renderPiece(isPlayer1sPiece, isHighlighted, modelMatrix) {
    checkBoolean(isPlayer1sPiece);
    checkBoolean(isHighlighted);

    const color = PIECE_COLORS[isPlayer1sPiece ? 0 : 1][isHighlighted ? 0 : 1];

    gl.uniform4fv(gl.program.uColor, Float32Array.from(color));
    gl.uniformMatrix4fv(gl.program.uModelMatrix, false, modelMatrix);
        
    // Draw the circle
    gl.bindVertexArray(gl.circle.vao);
    gl.drawArrays(gl.TRIANGLES, 0, gl.circle.numPoints);
    gl.bindVertexArray(null);
}

function makeCircleCoords(centerX, centerY, r, n) {
    // The angle between subsequent vertices
    let theta = (2 * Math.PI) / n;

    const coords = [];

    let prevX = centerX + r;
    let prevY = centerY;

    // Loop over each of the triangles we have to create
    for (let i = 1; i < n; ++i) {
        const curX = centerX + (Math.cos(i * theta) * r);
        const curY = centerY + (Math.sin(i * theta) * r);


        // Create and push a triangle
        coords.push(centerX, centerY, prevX, prevY, curX, curY);

        prevX = curX;
        prevY = curY;
    }
    // Connect the last vertex to the first vertex
    const firstX = centerX + (Math.cos(1 * theta) * r);
    const firstY = centerY + (Math.sin(1 * theta) * r);
    coords.push(centerX, centerY, prevX, prevY, firstX, firstY);

    return coords;
}

function reset_potentials() {
    /**
     * Sets POTENTIAL* spaces to NO_PIECE and *_HILIGHT to the non-hilight versions. Also clears
     * the hilighted_piece variable.
     */
    for (let i = 0; i < GLB_gameState.board.length; ++i) {
        let row = GLB_gameState.board[i];
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
    GLB_gameState.highlighted_piece = null;
}

function onClick(e) {
    e.preventDefault();

    // // Convert x and y from window coordinates (pixels) to clip coordinates (-1,-1 to 1,1)
    // let [x, y, w, h] = [e.offsetX, e.offsetY, this.width, this.height];
    // x = (x / (w/2)) - 1;
    // y = (-y / (h/2)) + 1;

    // // - If another valid square is clicked instead then the indicators are updated for the new valid piece 
    // if (isValidSquare(x, y)) {
    //     reset_potentials();
    //     GLB_gameState.highlighted_piece = {x: x, y: y};
    //     highlightPotentialMoves(x, y);
    // }   else {
    //     return;
    // }

    // // - After the initial click an indicator is drawn in all of the valid destination squares 

    // // - If a square with an indicator is clicked, then the piece is moved appropriately (possibly removing jumped 
    // // pieces and/or being promoted to a king) 
    // if ( GLB_gameState.highlighted_piece != null) {
    //     if (canSquareCanBeMovedTo(GLB_gameState.highlighted_piece.x, GLB_gameState.highlighted_piece.y, x, y)) {
    //         return;
    //     } else {
    //         reset_potentials();
    //     }
    // }
    
    selectSquare(x, y);
    render();
}

function selectSquare(x, y) {
    let valueAtSquare = GLB_gameState.board[x][y];

    let squareIsPiece = isValidPiece(true, valueAtSquare) || isValidPiece(false, valueAtSquare);

    // validates the moving piece
    if (GLB_gameState.highlighted_piece != null) {
        if (canSquareCanBeMovedTo(GLB_gameState.highlighted_piece.x, GLB_gameState.highlighted_piece.y, x, y)) {
            // TODO: move piece

            return;
        } else {
            reset_potentials();

        }
    }

    if (squareIsPiece) {
        GLB_gameState.highlighted_piece = {x, y};
        // TODO: highlight squares the piece can move to
    }
}

function isValidPiece(isBlack, value) {
    return isBlack ? "black" && BLACKS.indexOf(value) !== -1
        : "white" && WHITES.indexOf(value) !== -1;
}

function canSquareCanBeMovedTo(pieceX, pieceY, squareX, squareY) {
    const piece = board[pieceX][pieceY];
    const isKing = KINGS.indexOf(piece) !== -1;
    const squareToMoveTo = board[squareX][squareY];

    let squareAfterX = -1;
    let squareAfterY = -1;
    let squareAfter = null;
    if (Math.abs(squareX - pieceX) === 1 && Math.abs(squareY - pieceY) === 1) {
        squareAfterX = pieceX + (2 * (squareX - pieceX));
        squareAfterY = pieceY + (2 * (squareY - pieceY));

        if (squareAfterX < 0 || squareAfterX >= 8
            || squareAfterY < 0 || squareAfterY > 8) {
            squareAfterX = -1;
            squareAfterY = -1;
        } else {
            squareAfter = board[squareAfterX][squareAfterY];   
        }
    }

    if (!isKing) {
        // TODO: check if normal piece can be moved
        if (squareToMoveTo.indexOf(NO_PIECE)) {
            // piece.move();
        } else if (squareToMoveTo.indexOf(POTENTIAL) && squareAfter.indexOf(NO_PIECE)) {
            piece.move(); //needs to move over the piece
        }
        
        return;
    } else {
        // TODO: check if king can be moved
        if(squareToMoveTo.indexOf(NO_PIECE)) {
            // piece.move();
        } else if (squareToMoveTo.indexOf(POTENTIAL) && squareAfter.indexOf(NO_PIECE)) {
            // piece.move(); needs to move over the piece
        }
        return;
    }
}
