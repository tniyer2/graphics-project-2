// Checkers Game using WebGL
// AUTHORS: Bryan Cohen, Tanishq Iyer
'use strict';

////////// Constants //////////

// Drawing Sizes
const BOARD_SIZE = 8; // num squares in a row or column
const SQUARE_SIZE = 1 / BOARD_SIZE;
const PIECE_SIZE = SQUARE_SIZE * 0.8;

// Square Colors
const MOVEABLE_SQUARE_COLOR = [0.82, 0.55, 0.28, 1.0]; // dark squares
const IMMOVABLE_SQUARE_COLOR = [1.0, 0.89, 0.67, 1.0]; // light squares

// Piece Colors
const PLAYER_1_PIECE_COLOR =           [0.7, 0.0, 0.0, 1.0]; // red
const PLAYER_1_POTENTIAL_PIECE_COLOR = [0.8, 0.3, 0.3, 1.0]; // lighter red
const PLAYER_2_PIECE_COLOR =           [0.8, 0.8, 0.8, 1.0]; // gray
const PLAYER_2_POTENTIAL_PIECE_COLOR = [0.9, 0.9, 0.9, 1.0]; // lighter gray


const BORDER_THICKNESS = 0.05; // in proportion to to the object's size
const BORDER_COLOR = [0.0, 0.0, 0.0, 1.0]; // black

const POTENTIAL_PIECE_COLOR = [1.0, 1.0, 0.6, 1.0];

// The possible states for any square on the game board
const ALWAYS_EMPTY = -1;
const NO_PIECE = 0;
const PLAYER_1_PIECE = 1;
const PLAYER_2_PIECE = 2;
const PLAYER_1_PIECE_HIGHLIGHT = 3;
const PLAYER_2_PIECE_HIGHLIGHT = 4;
const PLAYER_1_KING = 5;
const PLAYER_2_KING = 6;
const PLAYER_1_KING_HIGHLIGHT = 7;
const PLAYER_2_KING_HIGHLIGHT = 8;
const POTENTIAL = 9;
const POTENTIAL_KING = 10;

const PLAYER_1_PIECES = [ PLAYER_1_PIECE, PLAYER_1_PIECE_HIGHLIGHT, PLAYER_1_KING, PLAYER_1_KING_HIGHLIGHT ];
const PLAYER_2_PIECES = [ PLAYER_2_PIECE, PLAYER_2_PIECE_HIGHLIGHT, PLAYER_2_KING, PLAYER_2_KING_HIGHLIGHT ];
const KINGS = [ PLAYER_1_KING, PLAYER_1_KING_HIGHLIGHT, PLAYER_2_KING, PLAYER_2_KING_HIGHLIGHT, POTENTIAL_KING ];
const HIGHLIGHTS = [ PLAYER_1_PIECE_HIGHLIGHT, PLAYER_1_KING_HIGHLIGHT, PLAYER_2_PIECE_HIGHLIGHT, PLAYER_2_KING_HIGHLIGHT ];
const POTENTIALS = [ POTENTIAL, POTENTIAL_KING ];

function create_starting_game_state() {
    const createRow = (type, offset) => Array(4).fill()
        .flatMap(() => offset ? [ ALWAYS_EMPTY, type ] : [ type, ALWAYS_EMPTY ]);

    return {
        isPlayer1sTurn: true,
        selected_piece: null,
        board: [
            createRow(PLAYER_1_PIECE, true),
            createRow(PLAYER_1_PIECE, false),
            createRow(PLAYER_1_PIECE, true),
            createRow(NO_PIECE,    false),
            createRow(NO_PIECE,    true),
            createRow(PLAYER_2_PIECE, false),
            createRow(PLAYER_2_PIECE, true),
            createRow(PLAYER_2_PIECE, false)
        ]
    };
}

// Global WebGL context variable
let gl;

// Initialize the game board
let GLB_gameState = create_starting_game_state();

function checkBoolean(a) {
    if (typeof a !== "boolean") {
        throw new Error("Invalid type, not a boolean: " + String(a));
    }
}

function xor(a, b) {
    return a !== b;
}

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
    gl.clearColor(1, 0, 1, 1);

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

        uniform vec4 uColor;

        out vec4 fragColor;

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
 * Initialize the data buffers of all models.
 */
function initBuffers() {
    const squareCoords = [-1, 1, -1, -1, 1, -1, -1, 1, 1, -1, 1, 1];
    gl.square = load2DModel(squareCoords);

    const normalPieceCoords = makeCircleCoords(0, 0, 1, 64);
    gl.normalPiece = load2DModel(normalPieceCoords);
}

function load2DModel(coords) {
    if (coords.length % 2 !== 0) {
        throw new Error("Invalid length. Length must be a multiple of 2.");
    }

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
        vao,
        positionBuffer,
        numPoints: coords.length / 2
    };
}

function makeCircleCoords(centerX, centerY, radius, numSides) {
    // The angle between subsequent vertices
    let theta = (2 * Math.PI) / numSides;

    const coords = [];

    const firstX = centerX + radius;
    const firstY = centerY;

    let prevX = firstX;
    let prevY = firstY;

    // Loop over each of the triangles we have to create
    for (let i = 1; i < numSides; ++i) {
        const curX = centerX + (Math.cos(i * theta) * radius);
        const curY = centerY + (Math.sin(i * theta) * radius);

        // Create and push a triangle
        coords.push(centerX, centerY, prevX, prevY, curX, curY);

        prevX = curX;
        prevY = curY;
    }

    // Connect the last vertex to the first vertex
    coords.push(centerX, centerY, prevX, prevY, firstX, firstY);

    return coords;
}

/**
 * Initialize event handlers
 */
function initEvents() {
    gl.canvas.addEventListener('click', onClick);
}

function onClick(e) {
    e.preventDefault();

    // Convert x and y from window coordinates (pixels) to clip coordinates (-1,-1 to 1,1)
    let [x, y, w, h] = [e.offsetX, e.offsetY, this.width, this.height];
    x = (x / (w / 2)) - 1;
    y = (-y / (h / 2)) + 1;

    // Convert from clip coordinates (-1,-1, to 1,1) to board coordinates (0,0 to 7,7)
    x = Math.ceil(((x + 1) * 4) - 1);
    y = Math.ceil(((1 - y) * 4) - 1);

    console.log(x, y);

    // // - If another valid square is clicked instead then the indicators are updated for the new valid piece 
    // reset_potentials();
    // GLB_gameState.selected_piece = {x: x, y: y};
    // highlightPotentialMoves(x, y);

    // // - After the initial click an indicator is drawn in all of the valid destination squares 

    // // - If a square with an indicator is clicked, then the piece is moved appropriately (possibly removing jumped 
    // // pieces and/or being promoted to a king) 
    // if ( GLB_gameState.selected_piece != null) {
    //     if (canSquareCanBeMovedTo(GLB_gameState.selected_piece.x, GLB_gameState.selected_piece.y, x, y)) {
    //         return;
    //     } else {
    //         reset_potentials();
    //     }
    // }
    
    selectSquare(x, y);
    render();
}

function isPieceOwnedByPlayerWithCurrentTurn(squareValue, isPlayer1sTurn) {
    return isSquareTypeIn(squareValue,
        isPlayer1sTurn ? PLAYER_1_PIECES : PLAYER_2_PIECES);
}

function selectSquare(x, y) {
    let squareValue = GLB_gameState.board[y][x];
    console.log(squareValue);

    let isPieceOnSquare = isPieceOwnedByPlayerWithCurrentTurn(
        squareValue, GLB_gameState.isPlayer1sTurn);

    if (isPieceOnSquare) {
        if (!isPieceSelected(x, y)) {
            reset_potentials();
            selectPiece(squareValue, x, y);
        }
    } else if (isSquareTypeIn(squareValue, POTENTIALS)) {
        const sp = GLB_gameState.selected_piece;
        movePiece(sp.x, sp.y, x, y);
    }
}

function selectPiece(pieceValue, x, y) {
    const moves = getPossibleMoves(x, y);
    highlightSquares(moves);

    GLB_gameState.selected_piece = {x, y};
    GLB_gameState.board[y][x] = toHighlighted(pieceValue);
}

function toHighlighted(piece) {
    switch (piece) {
    case PLAYER_1_PIECE:
        return PLAYER_1_PIECE_HIGHLIGHT;
    case PLAYER_1_KING:
        return PLAYER_1_KING_HIGHLIGHT;
    case PLAYER_2_PIECE:
        return PLAYER_2_PIECE_HIGHLIGHT;
    case PLAYER_2_KING:
        return PLAYER_2_KING_HIGHLIGHT;
    default:
        throw new Error("Invalid type.");
    }
}

function getPossibleMoves(x, y) {

}

function highlightSquares(moves) {

}

function movePiece(fromX, fromY, toX, toY) {
    // TODO
} 

function canSquareBeMovedTo(pieceX, pieceY, squareX, squareY) {
    const piece = GLB_gameState.board[pieceX][pieceY];
    const isKing = KINGS.indexOf(piece) !== -1;
    const squareToMoveTo = GLB_gameState.board[squareX][squareY];

    let squareAfterX = -1;
    let squareAfterY = -1;
    let squareAfter = null;
    if (Math.abs(squareX - pieceX) === 1 && Math.abs(squareY - pieceY) === 1) {
        squareAfterX = pieceX + (2 * (squareX - pieceX));
        squareAfterY = pieceY + (2 * (squareY - pieceY));

        if (squareAfterX < 0 || squareAfterX >= BOARD_SIZE
            || squareAfterY < 0 || squareAfterY > BOARD_SIZE) {
            squareAfterX = -1;
            squareAfterY = -1;
        } else {
            squareAfter = GLB_gameState.board[squareAfterX][squareAfterY];   
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

/**
 * Sets POTENTIAL* spaces to NO_PIECE and *_HILIGHT to the non-hilight versions. Also clears
 * the hilighted_piece variable.
 */
function reset_potentials() {
    for (let i = 0; i < BOARD_SIZE; ++i) {
        for (let j = 0; j < BOARD_SIZE; ++j) {
            const square = GLB_gameState.board[i][j];
            let newSquare;

            if (square === POTENTIAL || square === POTENTIAL_KING) {
                newSquare = NO_PIECE;
            } else if (square === PLAYER_1_PIECE_HIGHLIGHT) {
                newSquare = PLAYER_1_PIECE;
            } else if (square === PLAYER_2_PIECE_HIGHLIGHT) {
                newSquare = PLAYER_2_PIECE;
            } else if (square === PLAYER_1_KING_HIGHLIGHT) {
                newSquare = PLAYER_1_KING;
            } else if (square === PLAYER_2_KING_HIGHLIGHT) {
                newSquare = PLAYER_2_KING;
            } else {
                newSquare = square;
            }

            GLB_gameState.board[i][j] = newSquare;
        }
    }

    GLB_gameState.selected_piece = null;
}

/**
 * Render the scene. Uses loop(s) to to go over the entire board and render each square and piece.
 * The light squares (which cannot have pieces on them) are not directly done here but instead by
 * the clear color.
 */
function render() {
    // Clear the current rendering
    gl.clear(gl.COLOR_BUFFER_BIT);

    iterateBoard(GLB_gameState.board, (row, col, squareValue, isSquareMoveable) => {
        renderSquare(isSquareMoveable, calcMatrixForSquare(row, col, SQUARE_SIZE));
        
        if (!isSquareEmpty(squareValue)) {                
            renderPiece(
                isSquareTypeIn(squareValue, PLAYER_1_PIECES),
                isSquareTypeIn(squareValue, HIGHLIGHTS),
                calcMatrixForSquare(row, col, PIECE_SIZE),
                calcMatrixForSquare(row, col, PIECE_SIZE * (1 + BORDER_THICKNESS))
            );
        }
    });
}

function iterateBoard(board, callback) {
    for (let i = 0; i < BOARD_SIZE; ++i) {
        const isRowOffset = i % 2 === 0; // first row (i=0) is offset
        
        for (let j = 0; j < BOARD_SIZE; ++j) {
            const isColumnEven = j % 2 === 0;
            const isSquareMoveable = xor(isRowOffset, isColumnEven);
            
            callback(i, j, board[i][j], isSquareMoveable);
        }
    }
}

function isSquareEmpty(type) {
    return type === NO_PIECE || type === ALWAYS_EMPTY;
}

function isSquareTypeIn(type, types) {
    return types.indexOf(type) !== -1;
}

function isPieceSelected(squareX, squareY) {
    const h = GLB_gameState.selected_piece;
    return h !== null && h.x === squareX && h.y === squareY;
}

function calcMatrixForSquare(row, col, scaleConstant) {
    let tx = SQUARE_SIZE * (-7 + (col * 2));
    let ty = SQUARE_SIZE * (7 - (row * 2));

    let t = glMatrix.mat4.fromTranslation(
        glMatrix.mat4.create(),
        [ tx, ty, 0 ]);

    let s = glMatrix.mat4.fromScaling(
        glMatrix.mat4.create(),
        Array(3).fill(scaleConstant));

    return glMatrix.mat4.multiply(glMatrix.mat4.create(), t, s);
}

/**
 * Renders the squares for checkers board.
 */
function renderSquare(isSquareMoveable, modelMatrix) {
    gl.uniformMatrix4fv(gl.program.uModelMatrix, false, modelMatrix);
    
    const color = isSquareMoveable ? MOVEABLE_SQUARE_COLOR : IMMOVABLE_SQUARE_COLOR;
    gl.uniform4fv(gl.program.uColor, Float32Array.from(color));

    renderTriangles(gl.square);
}

/**
 * Renders a circle for the piece.
 */
function renderPiece(isPlayer1sPiece, isPotential, modelMatrix, borderMatrix) {
    checkBoolean(isPlayer1sPiece);
    checkBoolean(isPotential);

    // Draw the Border
    gl.uniformMatrix4fv(gl.program.uModelMatrix, false, borderMatrix);

    gl.uniform4fv(gl.program.uColor, Float32Array.from(BORDER_COLOR));

    renderTriangles(gl.normalPiece);


    // Draw the Piece
    gl.uniformMatrix4fv(gl.program.uModelMatrix, false, modelMatrix);

    const c = getPieceColor(isPlayer1sPiece, isPotential);
    gl.uniform4fv(gl.program.uColor, Float32Array.from(c));

    renderTriangles(gl.normalPiece);
}

function renderTriangles(model) {
    gl.bindVertexArray(model.vao);
    gl.drawArrays(gl.TRIANGLES, 0, model.numPoints);
    gl.bindVertexArray(null);
}

function getPieceColor(isPlayer1sPiece, isPotential) {
    if (isPlayer1sPiece) {
        if (isPotential) {
            return PLAYER_1_POTENTIAL_PIECE_COLOR;
        } else {
            return PLAYER_1_PIECE_COLOR;
        }
    } else {
        if (isPotential) {
            return PLAYER_2_POTENTIAL_PIECE_COLOR;
        } else {
            return PLAYER_2_PIECE_COLOR;
        }
    }
}
