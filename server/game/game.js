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

let Game = {
    currentRound: 0,

    nextCycle(startPlayer) {
        if (this.currentRound === 0) {
            logger.info('checking wiise');
            this.checkWiise();
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
            const seqScores = {3:20, 4:50, 5:100, 6:150, 7:200, 8:250, 9:300};

            // 1) Gruppiere nach Farbe für Sequenzen & Stöck
            const byColor = player.cards.reduce((g, c) => {
                (g[c.color] = g[c.color] || []).push(c);
                return g;
            }, {});
            logger.info('grouped')
            Object.entries(byColor).forEach(([color, cards]) => {
                cards.sort((a, b) => a.number - b.number);

                // A) Sequenzen ≥3
                let start = 0;
                for (let i = 1; i <= cards.length; i++) {
                    if (i < cards.length && cards[i].number === cards[i - 1].number + 1) continue;

                    const len = i - start;
                    if (len >= 3) {
                        const run = cards.slice(start, i);
                        const score = seqScores[len] || 0;
                        const isTrump = (gameType.mode === GameMode.TRUMPF && color === gameType.trumpfColor);
                        logger.info('FOUND wiis' + run);
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
                    const hasOber = cards.some(c => c.number === 12);
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
            logger.info('grouping for 4')
            // 2) Gruppiere nach number für Vierlinge
            const byNumber = player.cards.reduce((g, c) => {
                (g[c.number] = g[c.number] || []).push(c);
                return g;
            }, {});
            Object.entries(byNumber).forEach(([num, same]) => {
                if (same.length === 4) {
                    const n = Number(num);
                    let score;
                    if (n === 11) score = 200;        // 4 Unter
                    else if (n === 9) score = 150;   // 4 Neuner
                    else score = 100;                // alle anderen Vierlinge
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
            logger.info('alle weise')
            logger.info(weise)
            return weise;
        };
        logger.info('finding all wiis')
        // 3) Für alle Spieler alle Weisen finden
        const playerWeise = this.players.map((player, idx) => ({
            player,
            allWeise: findWeise(player, this.gameType, idx)
        }));
        if (playerWeise.every(pw => pw.allWeise.length === 0)) return;

        logger.info(playerWeise)
        logger.info('finding best wiis')
        // 4) Aus allen Weisen den höchsten pro Spieler bestimmen
        // Bestimme besten Weis pro Spieler
        const orderType = ['sequence','fourKind','stoeck'];
        playerWeise.forEach(pw => {
            if (pw.allWeise.length > 0) {
                pw.winningWeise = pw.allWeise.reduce((best, w) => {
                    if (!best) return w;
                    if (orderType.indexOf(w.type) < orderType.indexOf(best.type)) return w;
                    if (orderType.indexOf(w.type) > orderType.indexOf(best.type)) return best;
                    if (w.highest !== best.highest) return w.highest > best.highest ? w : best;
                    if (w.isTrump !== best.isTrump) return w.isTrump ? w : best;
                    return w.order < best.order ? w : best;
                }, null);
            } else {
                pw.winningWeise = null;
            }
        });
        // Filtere nur Spieler mit einem Weis
        const contenders = playerWeise.filter(pw => pw.winningWeise);
        // 4) Sieger bestimmen
        const victor=contenders.reduce((win,cur)=>{
            const a=win.winningWeise,b=cur.winningWeise;
            if(orderType.indexOf(b.type)<orderType.indexOf(a.type)) return cur;
            if(orderType.indexOf(b.type)>orderType.indexOf(a.type)) return win;
            if(b.highest!==a.highest) return b.highest>a.highest?cur:win;
            if(b.isTrump!==a.isTrump) return b.isTrump?cur:win;
            return b.order<a.order?cur:win;
        });
        // 5) Tie-Check: mehrere gleiche Sieger?
        const tied=contenders.filter(pw=>{
            const w=pw.winningWeise, v=victor.winningWeise;
            return w.type===v.type&&w.highest===v.highest&&w.isTrump===v.isTrump;
        });
        if(tied.length>1){
            throw new Error('Mehrere unentschiedene Sieger: '+tied.map(p=>p.player.id).join(','));
        }
        // 6) Maps speichern
        this.allWeiseMap=new Map(playerWeise.map(pw=>[pw.player.id,pw.allWeise.map(w=>w.cards)]));
        this.winningWeiseMap=new Map([[victor.player.id,victor.winningWeise.cards]]);
        this.victor=victor.player;
        logger.info(this.winningWeiseMap)
        logger.info(this.allWeiseMap)
        // 7) Punkte gutschreiben
        playerWeise.forEach(({player,winningWeise})=>{
            if(winningWeise&&player===this.victor){
                let team = player.team
                team.points=(team.points||0)+winningWeise.score;
                logger.info(team.points)
            }
        });
        handleWiise(this, this.winningWeiseMap, this.allWeiseMap );
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