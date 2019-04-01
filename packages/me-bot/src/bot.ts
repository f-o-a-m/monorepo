import { Node, UninstallVirtualMessage } from "@counterfactual/node";
import { Address, Node as NodeTypes } from "@counterfactual/types";
import { ethers } from "ethers";
import { Zero } from "ethers/constants";
import { BigNumber, bigNumberify } from "ethers/utils";
import { v4 as generateUUID } from "uuid";

import { getFreeBalance, renderFreeBalanceInEth } from "./utils";

function checkDraw(board: Board) {
  return board.every((row: BoardRow) =>
    row.every((square: BoardSquare) => !bigNumberify(square).eq(Zero))
  );
}

function checkVictory(board: Board, player: number) {
  return (
    checkVerticalVictory(board, player)
  );
}

function transpose(a) {
    return Object.keys(a[0]).map(function(c) {
            return a.map(function(r) { return r[c]; });
        });
}

function checkVerticalVictory(board: Board, player: number) {
  let idx = 0;

  var pl  = player - 1;
  var opp = player % 2;

  var bt = transpose(board);

  var t1 = bt[pl].filter(a => a != 0);
  var plL = t1.length;
  var t2 = bt[opp].filter(a => a != 0);
  var oppL = t2.length;
  console.log(plL, oppL)
  const victory = plL == 100 && oppL != 100;

  return victory
    ? {
        idx,
        winClaimType: WinClaimType.COL
      }
    : false;
}

function respond(
  node: Node,
  nodeAddress: Address,
  { data: { appInstanceId, newState } }
) {
  const { board, players, turnNum, winner } = newState;
  const playerAddress = ethers.utils.HDNode.fromExtendedKey(
    nodeAddress
  ).derivePath("0").address;
  const botPlayerNumber = players.indexOf(playerAddress) + 1;
  const isBotTurn =
    bigNumberify(turnNum).toNumber() % 2 === botPlayerNumber - 1;
  const noWinnerYet =
    bigNumberify(winner).toNumber() === Winner.GAME_IN_PROGRESS;

  if (noWinnerYet && isBotTurn) {
    const action = takeTurn(board, botPlayerNumber);
    const request = {
      params: {
        appInstanceId,
        action
      },
      requestId: generateUUID(),
      type: NodeTypes.MethodName.TAKE_ACTION
    };

    node.call(request.type, request);
  }
}

export function takeTurn(board: Board, botPlayerNumber: number) {
  const { playX, playY } = makeMove(board, botPlayerNumber);
  board[playY][playX] = bigNumberify(botPlayerNumber);
  const winClaim = checkVictory(board, botPlayerNumber);

  return {
    playX,
    playY,
    actionType: determineActionType(board, botPlayerNumber),
    winClaim: winClaim || { winClaimType: WinClaimType.COL, idx: 0 }
  };
}

function makeMove(board: Board, botPlayerNumber: number)   {
  const possibleMoves: Coordinates[] = [];

  let x = botPlayerNumber - 1;
  for (let y = 0; y < 100; y += 1) {
    if (bigNumberify(board[y][x]).toNumber() === 0) {
      possibleMoves.push({
        x,
        y
      } as Coordinates);
    }
  }

  if (possibleMoves.length === 0) {
    throw new Error("Yikes! No place left to move.");
  }

  possibleMoves.sort();
  const move = possibleMoves[0];
  const playX = move.x;
  const playY = move.y;

  return {
    playX,
    playY
  };
}

function determineActionType(board: Board, botPlayerNumber: number) {
  if (checkVictory(board, botPlayerNumber)) {
    return ActionType.PLAY_AND_WIN;
  }
  if (checkDraw(board)) {
    return ActionType.PLAY_AND_DRAW;
  }
  return ActionType.PLAY;
}

export async function connectNode(
  botName: string,
  node: Node,
  botPublicIdentifier: string,
  multisigAddress?: string
) {
  node.on(NodeTypes.EventName.PROPOSE_INSTALL_VIRTUAL, async data => {
    const appInstanceId = data.data.appInstanceId;
    const intermediaries = data.data.params.intermediaries;

    const request = {
      type: NodeTypes.MethodName.INSTALL_VIRTUAL,
      params: {
        appInstanceId,
        intermediaries
      },
      requestId: generateUUID()
    };

    try {
      await node.call(request.type, request);
      node.on(NodeTypes.EventName.UPDATE_STATE, async updateEventData => {
        if (updateEventData.data.appInstanceId === appInstanceId) {
          respond(node, botPublicIdentifier, updateEventData);
        }
      });
    } catch (e) {
      console.error("Node call to install virtual app failed.");
      console.error(request);
      console.error(e);
    }
  });

  if (multisigAddress) {
    node.on(
      NodeTypes.EventName.UNINSTALL_VIRTUAL,
      async (uninstallMsg: UninstallVirtualMessage) => {
        console.info(`Uninstalled app`);
        console.info(uninstallMsg);
        renderFreeBalanceInEth(await getFreeBalance(node, multisigAddress));
      }
    );
  }
  console.info(`Bot ${botName} is ready to serve`);
}

type BoardSquare = number | BigNumber;
type BoardRow = BoardSquare[];
type Board = BoardRow[];

type Coordinates = {
  x: number;
  y: number;
};

enum Winner {
  GAME_IN_PROGRESS = 0,
  PLAYER_1,
  PLAYER_2,
  GAME_DRAWN
}

enum ActionType {
  PLAY = 0,
  PLAY_AND_WIN, // = 1
  PLAY_AND_DRAW, // = 2
  DRAW // = 3
}

enum WinClaimType {
  COL = 0,
}
