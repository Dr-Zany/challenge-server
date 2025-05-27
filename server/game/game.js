import * as Deck from './deck/deck';
import * as Cycle from './cycle/cycle';
import { GameMode } from './../../shared/game/gameMode';
import {Logger as logger} from '../logger';

function handleChooseTrumpf(game, gameType) {
    game.gameType = gameType;
    game.clientApi.broadcastTrumpf(gameType);
    return game.nextCycle();
}

function handleWiise(game, winningWiis, allWiis){
    game.clientApi.broadcastWiis(winningWiis, allWiis);
}

function handleChooseTrumpfGeschoben(game, actPlayer, gameType) {
    if (gameType.mode !== GameMode.SCHIEBE) {
        return handleChooseTrumpf(game, gameType);
    }

    actPlayer.rejectTrumpf(gameType);
    return actPlayer.requestTrumpf(true).then((gameType) => {
        return handleChooseTrumpfGeschoben(game, actPlayer, gameType);
    });
}

function transformErrorMessageToErrorObject(player, message) {
    return new Promise((resolve, reject) => reject({
        message,
        data: player
    }));
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
let Game = {
    currentRound: 0,

    async nextCycle(startPlayer) {
        if (this.currentRound === 0) {
            logger.info('checking wiise');
            let isWiise = this.checkWiise();
            if (isWiise) {
                await sleep(10000)
            }
            isWiise = false;
        }

        if (this.currentRound < 9) {
            this.startPlayer = startPlayer || this.startPlayer;
            let cycle = Cycle.create(this.startPlayer, this.players, this.clientApi, this.gameType);
            this.currentRound++;
            return cycle.iterate().then((winner) => {
                return this.nextCycle(winner);
            });
        }
    },


    schieben() {
        for (let i = 0; i < this.players.length; i++) {
            let actPlayer = this.players[i];
            if (actPlayer !== this.startPlayer && actPlayer.team.name === this.startPlayer.team.name) {
                return actPlayer.requestTrumpf(true)
                    .catch(error => transformErrorMessageToErrorObject(actPlayer, error))
                    .then(gameType => handleChooseTrumpfGeschoben(this, actPlayer, gameType));
            }
        }
    },

    start() {
        return this.startPlayer.requestTrumpf(false)
            .catch(error => transformErrorMessageToErrorObject(this.startPlayer, error))
            .then((gameType) => {
                if (gameType.mode === GameMode.SCHIEBE) {
                    this.clientApi.broadcastTrumpf(gameType);
                    return this.schieben();
                } else {
                    return handleChooseTrumpf(this, gameType);
                }
            });
    },

    checkWiise() {
        // Hilfsfunktion: findet alle Weisen eines Spielers
        const findWeise = (player, gameType, announceOrder) => {
            const weise = [];
            // Score-Mapping für Sequenzen
            const seqScores = { 3: 20, 4: 50, 5: 100, 6: 150, 7: 200, 8: 250, 9: 300 };

            // 1) Gruppiere nach Farbe für Sequenzen & Stöck
            const byColor = player.cards.reduce((g, c) => {
                (g[c.color] = g[c.color] || []).push(c);
                return g;
            }, {});
            logger.info('grouped by color for player', player.id);

            Object.entries(byColor).forEach(([color, cards]) => {
                cards.sort((a, b) => a.number - b.number);

                // A) Sequenzen ≥3
                let start = 0;
                for (let i = 1; i <= cards.length; i++) {
                    if (i < cards.length && cards[i].number === cards[i - 1].number + 1) {
                        continue;
                    }
                    const len = i - start;
                    if (len >= 3) {
                        const run = cards.slice(start, i);
                        const score = seqScores[len] || 0;
                        const isTrump = (gameType.mode === GameMode.TRUMPF && color === gameType.trumpfColor);
                        logger.info(`FOUND sequence of length ${len} for player ${player.id}`);
                        weise.push({
                            type: 'sequence',
                            cards: run,
                            score,
                            highest: run[len - 1].number,
                            isTrump,
                            order: announceOrder
                        });
                    }
                    start = i;
                }

                // B) Stöck (Ober+König), nur im Trumpf
                if (gameType.mode === GameMode.TRUMPF && color === gameType.trumpfColor) {
                    const hasOber   = cards.some(c => c.number === 12);
                    const hasKoenig = cards.some(c => c.number === 13);
                    if (hasOber && hasKoenig) {
                        const stoeckCards = cards.filter(c => c.number === 12 || c.number === 13);
                        weise.push({
                            type: 'stoeck',
                            cards: stoeckCards,
                            score: 20,
                            highest: 13,
                            isTrump: true,
                            order: announceOrder
                        });
                    }
                }
            });

            // 2) Gruppiere nach number für Vierlinge
            const byNumber = player.cards.reduce((g, c) => {
                (g[c.number] = g[c.number] || []).push(c);
                return g;
            }, {});
            Object.entries(byNumber).forEach(([num, same]) => {
                if (same.length === 4) {
                    const n = Number(num);
                    let score;
                    if (n === 11)       score = 200; // 4 Unter
                    else if (n === 9)   score = 150; // 4 Neuner
                    else                score = 100; // alle anderen Vierlinge

                    weise.push({
                        type: 'fourKind',
                        cards: same,
                        score,
                        highest: n,
                        isTrump: false,
                        order: announceOrder
                    });
                }
            });

            logger.info('all found weise for player', player.id, weise);
            return weise;
        };

        logger.info('finding all wiis for each player');
        // 3) Für alle Spieler alle Weisen finden
        const playerWeise = this.players.map((player, idx) => ({
            player,
            allWeise: findWeise(player, this.gameType, idx)
        }));

        // Wenn niemand eine Weis hat, abbrechen
        if (playerWeise.every(pw => pw.allWeise.length === 0)) {
            logger.info('no weis found for any player');
            return;
        }

        logger.info('selecting best weis per player');
        // 4) Bestes Weis pro Spieler bestimmen (score-first)
        playerWeise.forEach(pw => {
            if (pw.allWeise.length === 0) {
                pw.winningWeise = null;
            } else {
                pw.winningWeise = pw.allWeise.reduce((best, w) => {
                    if (!best) return w;
                    // 1) Higher score wins
                    if (w.score !== best.score) {
                        return w.score > best.score ? w : best;
                    }
                    // 2) Trump run wins over non-trump
                    if (w.isTrump !== best.isTrump) {
                        return w.isTrump ? w : best;
                    }
                    // 3) Longer run/fourKind wins
                    if (w.cards.length !== best.cards.length) {
                        return w.cards.length > best.cards.length ? w : best;
                    }
                    // 4) Earlier announcement wins
                    return w.order < best.order ? w : best;
                }, null);
            }
        });

        // 5) Nur Spieler mit einer gewinnenden Weis betrachten
        const contenders = playerWeise.filter(pw => pw.winningWeise !== null);

        // 6) Gesamtsieger bestimmen (gleiche score-first Logik)
        const victorPw = contenders.reduce((bestPw, curPw) => {
            const a = bestPw.winningWeise;
            const b = curPw.winningWeise;

            if (b.score !== a.score) {
                return b.score > a.score ? curPw : bestPw;
            }
            if (b.isTrump !== a.isTrump) {
                return b.isTrump ? curPw : bestPw;
            }
            if (b.cards.length !== a.cards.length) {
                return b.cards.length > a.cards.length ? curPw : bestPw;
            }
            return curPw.winningWeise.order < a.order ? curPw : bestPw;
        });

        // 7) Tie-Check: exakter Gleichstand?
        const top = victorPw.winningWeise;
        const tied = contenders.filter(pw => {
            const w = pw.winningWeise;
            return (
                w.score === top.score &&
                w.isTrump === top.isTrump &&
                w.cards.length === top.cards.length &&
                w.order === top.order
            );
        });
        if (tied.length > 1) {
            logger.info('tie detected, no victor this round:', tied.map(pw => pw.player.id));
            return;
        }

        // 8) Ergebnis-Mappings speichern
        const victorPlayer        = victorPw.player;
        const winningWeiseCards   = victorPw.winningWeise.cards;

        this.allWeiseMap     = new Map(playerWeise.map(pw => [ pw.player.id, pw.allWeise.map(w => w.cards) ]));
        this.winningWeiseMap = new Map([[ victorPlayer.id, winningWeiseCards ]]);
        this.victor          = victorPlayer;

        // 9) Punkte gutschreiben
        playerWeise.forEach(({ player, winningWeise }) => {
            if (winningWeise && player === this.victor) {
                const team = player.team;
                team.points = (team.points || 0) + winningWeise.score;
                logger.info(`awarded ${winningWeise.score} points to team of player ${player.id}`);
            }
        });

        // 10) Broadcast triggern
        handleWiise(this, this.winningWeiseMap, this.allWeiseMap);

        return true;
    }



};

export function create(players, maxPoints, startPlayer, clientApi) {
    let game = Object.create(Game);
    game.deck = Deck.create();
    players.forEach(player => {
        game.deck.deal(player, 9);
    });

    game.players = players;
    game.maxPoints = maxPoints;
    game.startPlayer = startPlayer;
    game.clientApi = clientApi;
    return game;
}