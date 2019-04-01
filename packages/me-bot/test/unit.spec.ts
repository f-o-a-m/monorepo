import { ethers } from "ethers";

import { takeTurn } from "../src/bot";

function bigNumberifyBoard(board) {
  return board.reduce((board, row) => {
    board.push(
      row.reduce((row, square) => {
        row.push(ethers.utils.bigNumberify(square));

        return row;
      }, [])
    );

    return board;
  }, []);
}

describe("takeTurn", () => {

  it("throws an error if there are no moves to make", () => {
    var a = Array(100).fill([1,2]);
    const board = bigNumberifyBoard(a);
    expect(() => takeTurn(board, 2)).toThrowError(
      "Yikes! No place left to move."
    );
  });

  it("sets the actionType to 2 (aka a draw) when there is a single, non-winning move to make", () => {
    var a = Array(99).fill([1,2]);
    a.push([1,0]);
    a.reverse();
    const board = bigNumberifyBoard(a);
    const result = takeTurn(board, 2);

    expect(result.actionType).toBe(2);
    expect(result.winClaim).toEqual({ idx: 0, winClaimType: 0 });
    expect(result.playX).toBe(1);
    expect(result.playY).toBe(0);
  });

  it("sets the actionType to 1 (aka a victory) when it wins the game", () => {
    var a = Array(99).fill([1,2]);
    a.push([0,0]);
    a.reverse();
    const board = bigNumberifyBoard(a);
    const result = takeTurn(board, 2);

    expect(result.actionType).toBe(1);
    expect(result.winClaim).toEqual({ idx: 0, winClaimType: 0 });
    expect(result.playX).toBe(1);
    expect(result.playY).toBe(0);
  });
});
