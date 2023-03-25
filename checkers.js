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
const PLAYER_1_HIGHLIGHTED_PIECE_COLOR = [0.8, 0.3, 0.3, 1.0]; // lighter red
const PLAYER_2_PIECE_COLOR =           [0.8, 0.8, 0.8, 1.0]; // gray
const PLAYER_2_HIGHLIGHTED_PIECE_COLOR = [0.9, 0.9, 0.9, 1.0]; // lighter gray


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
const POTENTIAL_PIECE = 9;
const POTENTIAL_KING = 10;

const PLAYER_1_PIECES = [ PLAYER_1_PIECE, PLAYER_1_PIECE_HIGHLIGHT, PLAYER_1_KING, PLAYER_1_KING_HIGHLIGHT ];
const PLAYER_2_PIECES = [ PLAYER_2_PIECE, PLAYER_2_PIECE_HIGHLIGHT, PLAYER_2_KING, PLAYER_2_KING_HIGHLIGHT ];
const KINGS = [ PLAYER_1_KING, PLAYER_1_KING_HIGHLIGHT, PLAYER_2_KING, PLAYER_2_KING_HIGHLIGHT, POTENTIAL_KING ];
const POTENTIALS = [ POTENTIAL_PIECE, POTENTIAL_KING ];

function create_starting_game_state() {
    const createRow = (type, offset) => Array(4).fill()
        .flatMap(() => offset ? [ ALWAYS_EMPTY, type ] : [ type, ALWAYS_EMPTY ]);

    const r = {
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

    let isPlayer1sTurn = true;
    Object.defineProperty(r, "isPlayer1sTurn", {
        "get": () => isPlayer1sTurn,
        "set": (a) => {
            isPlayer1sTurn = a;
            updateTurnDisplay();
        }
    });

    return r;
}

// Global WebGL context variable
let gl;

// Initialize the game board
let GLB_gameState = create_starting_game_state();

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

    // set initial turn display
    updateTurnDisplay();

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

    const kingPieceCoords = [0, 1, -1, -1, 1, -1];
    gl.kingPiece = load2DModel(kingPieceCoords);
}

// Loads a model into the GPU.
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

// Creates a circle model.
// Returns an array of float positions.
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
    
    selectSquare(x, y);
    render();
}

// selects a square, this can either select a piece or move a piece to a potential square
function selectSquare(x, y) {
    let square = getSquare(x, y);

    let isPieceOwnedByPlayerWithCurrentTurn = isSquareTypeIn(square,
        GLB_gameState.isPlayer1sTurn ? PLAYER_1_PIECES : PLAYER_2_PIECES);

    if (isPieceOwnedByPlayerWithCurrentTurn) { // selects a piece
        if (!isPieceSelected(x, y)) {
            reset_potentials();
            selectPiece(square, x, y);
        }
    } else if (isSquareTypeIn(square, POTENTIALS)) { // moves a piece to a potential square
        const piece = GLB_gameState.selected_piece;
        const move = piece.moves.find(m => m.x === x && m.y === y);
        
        movePiece(piece.x, piece.y, move);
    }
}

// selects a piece, (only real ones not potential)
function selectPiece(piece, x, y) {
    const moves = getPossibleMoves(piece, x, y);
    markPotentialSquares(moves);

    GLB_gameState.selected_piece = {x, y, moves};
    GLB_gameState.board[y][x] = toHighlighted(piece);
}

// returns a list of possible moves for a given piece
function getPossibleMoves(fromPiece, fromX, fromY) {
    const isPlayer1sPiece = isSquareTypeIn(fromPiece, PLAYER_1_PIECES);
    const isKing = isSquareTypeIn(fromPiece, KINGS);

    const forwardDir = isPlayer1sPiece ? 1 : -1;

    function getPossibleMoveInDirection(isForward, isRight) {
        const dx = isRight ? 1 : -1;
        const dy = isForward ? forwardDir : forwardDir * -1;

        const nextX = fromX + dx;
        const nextY = fromY + dy;

        let nextSquare = getSquare(nextX, nextY);

        const isPromotion = (y) => (isPlayer1sPiece && y === BOARD_SIZE - 1) || (!isPlayer1sPiece && y === 0);

        if (nextSquare === NO_PIECE) {
            return {
                type: "normal",
                x: nextX,
                y: nextY,
                isKing: isKing || isPromotion(nextY)
            };
        } else if (isSquareTypeIn(nextSquare, isPlayer1sPiece ? PLAYER_2_PIECES : PLAYER_1_PIECES)) {
            const nextNextX = fromX + (dx * 2);
            const nextNextY = fromY + (dy * 2);

            let nextNextSquare = getSquare(nextNextX, nextNextY);

            if (nextNextSquare === NO_PIECE) {
                return {
                    type: "skip",
                    x: nextNextX,
                    y: nextNextY,
                    skipOverX: nextX,
                    skipOverY: nextY,
                    isKing: isKing || isPromotion(nextNextY)};
            } else {
                return null;
            }
        } else {
            return null;
        }
    }

    const moves = [];
    moves.push(getPossibleMoveInDirection(true, true));
    moves.push(getPossibleMoveInDirection(true, false));

    if (isKing) {
        moves.push(getPossibleMoveInDirection(false, true));
        moves.push(getPossibleMoveInDirection(false, false));
    }
    
    return moves.filter(a => a !== null);
}

function getSquare(x, y) {
    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) {
        return null;
    } else {
        return GLB_gameState.board[y][x];
    }
}

// marks all potential squares that can be moved to as potential
function markPotentialSquares(moves) {
    for (let i = 0; i < moves.length; ++i) {
        const {x, y, isKing} = moves[i];
        GLB_gameState.board[y][x] = isKing ? POTENTIAL_KING : POTENTIAL_PIECE;
    }
}

// converts piece to highlighted version
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

// executes a move for a piece on (fromX, fromY)
function movePiece(fromX, fromY, move) {
    const fromSquare = getSquare(fromX, fromY);
    const {x: toX, y: toY, isKing} = move;

    GLB_gameState.board[fromY][fromX] = NO_PIECE;

    const isPlayer1sPiece = isSquareTypeIn(fromSquare, PLAYER_1_PIECES);
    const newToSquare = isKing ?
        (isPlayer1sPiece ? PLAYER_1_KING : PLAYER_2_KING)
        : (isPlayer1sPiece ? PLAYER_1_PIECE : PLAYER_2_PIECE);
    GLB_gameState.board[toY][toX] = newToSquare;

    if (move.type === "skip") {
        const {skipOverX, skipOverY} = move;
        GLB_gameState.board[skipOverY][skipOverX] = NO_PIECE;
    }

    reset_potentials();

    const canDoubleJump =
        move.type === "skip"
        && getPossibleMoves(newToSquare, toX, toY)
            .filter(m => m.type === "skip").length > 0;

    if (canDoubleJump) {
        selectPiece(newToSquare, toX, toY);
    } else {
        GLB_gameState.isPlayer1sTurn = !GLB_gameState.isPlayer1sTurn;
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

            if (square === POTENTIAL_PIECE || square === POTENTIAL_KING) {
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
                squareValue,
                calcMatrixForSquare(row, col, PIECE_SIZE),
                calcMatrixForSquare(row, col, PIECE_SIZE * (1 + BORDER_THICKNESS))
            );
        }
    });
}

// iterates through board from top left to bottom right
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

// returns whether a square doesn't contain any pieces (including potential)
function isSquareEmpty(type) {
    return type === NO_PIECE || type === ALWAYS_EMPTY;
}

// returns if a square's type can be found in types.
function isSquareTypeIn(type, types) {
    return types.indexOf(type) !== -1;
}

// returns if the piece on (squareX, squareY) is currently selected.
function isPieceSelected(squareX, squareY) {
    const h = GLB_gameState.selected_piece;
    return h !== null && h.x === squareX && h.y === squareY;
}

// calculates the model matrix for a given square.
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
function renderPiece(square, modelMatrix, borderMatrix) {
    const isKing = isSquareTypeIn(square, KINGS);
    const pieceModel = isKing ? gl.kingPiece : gl.normalPiece;

    // Draw the Border
    gl.uniformMatrix4fv(gl.program.uModelMatrix, false, borderMatrix);

    gl.uniform4fv(gl.program.uColor, Float32Array.from(BORDER_COLOR));

    renderTriangles(pieceModel);


    // Draw the Piece
    gl.uniformMatrix4fv(gl.program.uModelMatrix, false, modelMatrix);

    const c = getPieceColor(square);
    gl.uniform4fv(gl.program.uColor, Float32Array.from(c));

    renderTriangles(pieceModel);
}

function renderTriangles(model) {
    gl.bindVertexArray(model.vao);
    gl.drawArrays(gl.TRIANGLES, 0, model.numPoints);
    gl.bindVertexArray(null);
}

// returns the corresponding color value for a given piece type.
function getPieceColor(piece) {
    switch (piece) {
    case PLAYER_1_PIECE:
        return PLAYER_1_PIECE_COLOR;
    case PLAYER_1_KING:
        return PLAYER_1_PIECE_COLOR;
    case PLAYER_1_PIECE_HIGHLIGHT:
        return PLAYER_1_HIGHLIGHTED_PIECE_COLOR;
    case PLAYER_1_KING_HIGHLIGHT:
        return PLAYER_1_HIGHLIGHTED_PIECE_COLOR;
    case PLAYER_2_PIECE:
        return PLAYER_2_PIECE_COLOR;
    case PLAYER_2_KING:
        return PLAYER_2_PIECE_COLOR;
    case PLAYER_2_PIECE_HIGHLIGHT:
        return PLAYER_2_HIGHLIGHTED_PIECE_COLOR;
    case PLAYER_2_KING_HIGHLIGHT:
        return PLAYER_2_HIGHLIGHTED_PIECE_COLOR;
    case POTENTIAL_PIECE:
        return POTENTIAL_PIECE_COLOR;
    case POTENTIAL_KING:
        return POTENTIAL_PIECE_COLOR;
    default:
        throw new Error("Invalid value.")
    }
}

// updates the turn display to show who's turn it is.
function updateTurnDisplay() {
    const elm = document.getElementById('player_turn');
    elm.textContent = GLB_gameState.isPlayer1sTurn ? "Player 1's Turn" : "Player 2's Turn";
}
