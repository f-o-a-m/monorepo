import { SolidityABIEncoderV2Struct, Terms } from "@counterfactual/types";
import chai from "chai";
import * as waffle from "ethereum-waffle";
import { Contract } from "ethers";
import { AddressZero, WeiPerEther } from "ethers/constants";
import { defaultAbiCoder } from "ethers/utils";

import MEApp from "../build/MEApp.json";

chai.use(waffle.solidity);

const { expect } = chai;

const [A, B] = [
  "0xb37e49bFC97A948617bF3B63BC6942BB15285715",
  "0xaeF082d339D227646DB914f0cA9fF02c8544F30b"
];

type MEAppState = {
  players: string[];
  turnNum: number;
  winner: number;
  board: number[][];
};

function transpose(m){
  return m[0].map((x,i) => m.map(x => x[i]));
}

function decodeBytesToAppState(encodedAppState: string): MEAppState {
  return defaultAbiCoder.decode(
    [
      "tuple(address[2] players, uint256 turnNum, uint256 winner, uint256[2][100] board)"
    ],
    encodedAppState
  )[0];
}

describe("MEApp", () => {
  let me: Contract;

  async function resolve(state: SolidityABIEncoderV2Struct, terms: Terms) {
    return await me.functions.resolve(encodeState(state), terms);
  }

  function encodeState(state: SolidityABIEncoderV2Struct) {
    return defaultAbiCoder.encode(
      [
        `
        tuple(
          address[2] players,
          uint256 turnNum,
          uint256 winner,
          uint256[2][100] board
        )
      `
      ],
      [state]
    );
  }

  function encodeAction(state: SolidityABIEncoderV2Struct) {
    return defaultAbiCoder.encode(
      [
        `
        tuple(
          uint8 actionType,
          uint256 playX,
          uint256 playY,
          tuple(
            uint8 winClaimType,
            uint256 idx
          ) winClaim
        )
      `
      ],
      [state]
    );
  }

  async function applyAction(
    state: SolidityABIEncoderV2Struct,
    action: SolidityABIEncoderV2Struct
  ) {
    return await me.functions.applyAction(
      encodeState(state),
      encodeAction(action)
    );
  }

  before(async () => {
    const provider = waffle.createMockProvider();
    const wallet = (await waffle.getWallets(provider))[0];
    me = await waffle.deployContract(wallet, MEApp);
  });

  describe("applyAction", () => {
    it("can place into an empty board", async () => {
      const preState = {
        players: [AddressZero, AddressZero],
        turnNum: 0,
        winner: 0,
        board: Array(100).fill([0,0]) //[[0, 0], [0, 0], [0, 0]]
      };

      const action = {
        actionType: 0,
        playX: 0,
        playY: 0,
        winClaim: {
          winClaimType: 0,
          idx: 0
        }
      };

      const ret = await applyAction(preState, action);

      const state = decodeBytesToAppState(ret);

      expect(state.board[0][0]).to.eq(1);
      expect(state.turnNum).to.eq(1);
    });

    it("can place into an empty square", async () => {
      var a = Array(99).fill([0,0])
      a.push([1,0])
      a.reverse()
      const preState = {
        players: [AddressZero, AddressZero],
        turnNum: 1,
        winner: 0,
        board: a
      };

      const action = {
        actionType: 0,
        playX: 1,
        playY: 1,
        winClaim: {
          winClaimType: 0,
          idx: 0
        }
      };

      const ret = await applyAction(preState, action);

      var state = decodeBytesToAppState(ret);

      expect(state.board[1][1]).to.eq(2);
      expect(state.turnNum).to.eq(2);
    });

    it("cannot place into an occupied square", async () => {
      var a = Array(99).fill([0,0])
      a.push([1,0])
      a.reverse()
      const preState = {
        players: [AddressZero, AddressZero],
        turnNum: 0,
        winner: 0,
        board: a
      };

      const action = {
        actionType: 0,
        playX: 0,
        playY: 0,
        winClaim: {
          winClaimType: 0,
          idx: 0
        }
      };

      await expect(applyAction(preState, action)).to.be.revertedWith(
        "playMove: square is not empty"
      );
    });

    it("can draw from a full board", async () => {
      var a = Array(100).fill([1,2])
      const preState = {
        players: [AddressZero, AddressZero],
        turnNum: 0,
        winner: 0,
        board: a
      };

      const action = {
        actionType: 3, // DRAW
        playX: 0,
        playY: 0,
        winClaim: {
          winClaimType: 0,
          idx: 0
        }
      };

      const ret = await applyAction(preState, action);

      const state = decodeBytesToAppState(ret);

      expect(state.winner).to.eq(3); // DRAWN
    });

    it("cannot draw from a non-full board", async () => {
      var a = Array(99).fill([1,2])
      a.push([1,0])
      const preState = {
        players: [AddressZero, AddressZero],
        turnNum: 0,
        winner: 0,
        board: a
      };

      const action = {
        actionType: 3, // DRAW
        playX: 0,
        playY: 0,
        winClaim: {
          winClaimType: 0,
          idx: 0
        }
      };

      await expect(applyAction(preState, action)).to.be.revertedWith(
        "assertBoardIsFull: square is not full"
      );
    });

    it("can play_and_draw from an almost full board", async () => {
      var a = Array(99).fill([1,2])
      a.push([0,2])
      a.reverse()
      const preState = {
        players: [AddressZero, AddressZero],
        turnNum: 0,
        winner: 0,
        board: a
      };

      const action = {
        actionType: 2, // PLAY_AND_DRAW
        playX: 0,
        playY: 0,
        winClaim: {
          winClaimType: 0,
          idx: 0
        }
      };

      const ret = await applyAction(preState, action);

      const state = decodeBytesToAppState(ret);

      expect(state.winner).to.eq(3); // DRAWN
    });

    it("cannot play_and_draw from a sparse board", async () => {
      var a = Array(98).fill([1,2])
      a.push([0,2])
      a.reverse()
      a.push([1,0])
      const preState = {
        players: [AddressZero, AddressZero],
        turnNum: 0,
        winner: 0,
        board: a
      };

      const action = {
        actionType: 2, // PLAY_AND_DRAW
        playX: 0,
        playY: 0,
        winClaim: {
          winClaimType: 0,
          idx: 0
        }
      };

      await expect(applyAction(preState, action)).to.be.revertedWith(
        "assertBoardIsFull: square is not full"
      );
    });

    xit("can play_and_win from a winning position", async () => {
      var a = Array(99).fill([1,0])
      a.push([1,0])
      a.reverse()
      const preState = {
        players: [AddressZero, AddressZero],
        turnNum: 0,
        winner: 0,
        board: a
      };

      const action = {
        actionType: 1, // PLAY_AND_WIN
        playX: 0,
        playY: 99,
        winClaim: {
          winClaimType: 0, // COL
          idx: 0
        }
      };

      const ret = await applyAction(preState, action);

      const state = decodeBytesToAppState(ret);

      expect(state.winner).to.eq(1); // WON
    });

    it("cannot play_and_win from a non winning position", async () => {
      var a = Array(99).fill([0,0])
      a.push([0,0])
      a.reverse()
      const preState = {
        players: [AddressZero, AddressZero],
        turnNum: 0,
        winner: 0,
        board: a
      };

      const action = {
        actionType: 1, // PLAY_AND_WIN
        playX: 0,
        playY: 1,
        winClaim: {
          winClaimType: 0, // COL
          idx: 0
        }
      };

      await expect(applyAction(preState, action)).to.be.revertedWith(
        "Win Claim not valid"
      );
    });
  });
  describe("resolve", () => {
    xit("playerFirst wins should resolve correctly", async () => {
      var a = Array(99).fill([0,0])
      a.push([1,0])
      a.reverse()
      const preState = {
        players: [A, B],
        turnNum: 0,
        winner: 0,
        board: a
      };

      const action = {
        actionType: 1, // PLAY_AND_WIN
        playX: 0,
        playY: 2,
        winClaim: {
          winClaimType: 0, // COL
          idx: 0
        }
      };

      const appliedAction = await applyAction(preState, action);
      const state = decodeBytesToAppState(appliedAction);

      const ret = await resolve(state, {
        assetType: 0,
        limit: WeiPerEther.mul(2),
        token: AddressZero
      });

      expect(state.winner).to.eq(1, "playerFirst won"); // WON
      expect(ret.to[0]).to.eq(A, "playerFirst wins money");
      expect(ret.to[1]).to.eq(B, "playerSecond loses money");
      expect(ret.value[0]).to.eq(WeiPerEther.mul(2));
      expect(ret.value[1]).to.eq(0);
    });
  });
});
