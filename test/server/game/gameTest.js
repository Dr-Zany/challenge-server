import { expect } from 'chai';
import * as Game from '../../../server/game/game';
import { GameMode } from '../../../shared/game/gameMode';
import * as GameType from '../../../server/game/gameType';
import { CardColor } from '../../../shared/deck/cardColor';
import * as ClientApi from '../../../server/communication/clientApi';
import * as Cycle from '../../../server/game/cycle/cycle';
import sinon from 'sinon';
import * as TestDataCreator from '../../testDataCreator';
import {Logger as logger} from '../../../server/logger';

describe('Game', function () {
    let clientApi = ClientApi.create();
    let maxPoints = 2500;
    let game;
    let clientApiMock;
    let cycleFactoryMock;

    let players;

    beforeEach(function () {
        clientApiMock = sinon.mock(clientApi);
        players = TestDataCreator.createPlayers(clientApi);
        cycleFactoryMock = sinon.mock(Cycle);
    });

    it('should properly deal cards to each player', () => {
        game = Game.create(players, maxPoints, players[0], clientApi);

        expect(game.deck).to.be.a('object');
        expect(game.players).to.be.a('array');
        expect(game.maxPoints).to.equal(maxPoints);
        expect(game.startPlayer).to.be.a('object');
        players.forEach(player => {
            expect(player.cards.length).to.equal(9);
            player.cards.forEach(card => {
                expect(card).not.to.be.undefined;
            });
        });
    });

    it('should request the trumpf from the correct player', () => {
        clientApiMock.expects('requestTrumpf').once()
            .withArgs(false).returns(Promise.reject());

        let playerWhoSchiebs = players[0];
        expect(playerWhoSchiebs.name).to.equal('hans');
        let hansSpy = sinon.spy(playerWhoSchiebs, 'requestTrumpf');

        game = Game.create(players, maxPoints, players[0], clientApi);
        game.start().catch(() => { /* ignore rejected promise */
        });

        clientApiMock.verify();
        sinon.assert.calledOnce(hansSpy);
    });

    it('should return error object when requesting trumpf exceeded timeout', (done) => {
        const errorMessage = 'some error message';
        clientApiMock.expects('requestTrumpf').once()
            .withArgs(false).returns(Promise.reject(errorMessage));
        game = Game.create(players, maxPoints, players[0], clientApi);

        game.start()
            .catch((errorObject) => {
                expect(errorObject.message).to.equal(errorMessage);
                expect(errorObject.data).to.eql(players[0]);
                clientApiMock.verify();
                done();
            })
            .catch(done);
    });

    it('should return error object when requesting geschoben trumpf exceeded timeout', (done) => {
        const errorMessage = 'some error message';
        clientApiMock.expects('requestTrumpf').once().returns(Promise.resolve({ mode: GameMode.SCHIEBE }));
        clientApiMock.expects('requestTrumpf').once().returns(Promise.reject(errorMessage));
        game = Game.create(players, maxPoints, players[0], clientApi);

        game.start()
            .catch((errorObject) => {
                expect(errorObject.message).to.equal(errorMessage);
                expect(errorObject.data).to.eql(players[2]);
                clientApiMock.verify();
                done();
            })
            .catch(done);
    });

    it('should request the trumpf from the correct player when the player schiebs', (done) => {
        var gameModeSchiebe = {
                mode: GameMode.SCHIEBE
            },
            gameModeObeabe = {
                mode: GameMode.OBEABE
            };

        clientApiMock.expects('requestTrumpf').once().withArgs(false).returns(Promise.resolve(gameModeSchiebe));
        clientApiMock.expects('broadcastTrumpf').once().withArgs(gameModeSchiebe);

        clientApiMock.expects('requestTrumpf').once().withArgs(true).returns(Promise.resolve(gameModeObeabe));
        clientApiMock.expects('broadcastTrumpf').once().withArgs(gameModeObeabe);

        let cycle = {
            iterate: () => {
            }
        };

        let cycleMock = sinon.mock(cycle).expects('iterate').exactly(9).returns(Promise.resolve());
        cycleFactoryMock.expects('create').exactly(9).returns(cycle);

        game = Game.create(players, maxPoints, players[0], clientApi);

        game.start().then(() => {
            clientApiMock.verify();
            cycleFactoryMock.verify();
            cycleMock.verify();
            done();
        }).catch(done);

    });

    it('should deny mode SCHIEBE if geschoben', (done) => {
        clientApiMock.expects('requestTrumpf').once().withArgs(false).returns(Promise.resolve({
            mode: GameMode.SCHIEBE
        }));

        clientApiMock.expects('requestTrumpf').once().withArgs(true).returns(Promise.resolve({
            mode: GameMode.SCHIEBE
        }));

        clientApiMock.expects('rejectTrumpf').once().withArgs({ mode: GameMode.SCHIEBE });

        clientApiMock.expects('requestTrumpf').once().withArgs(true).returns(Promise.resolve({
            mode: GameMode.SCHIEBE
        }));

        clientApiMock.expects('rejectTrumpf').once().withArgs({ mode: GameMode.SCHIEBE });

        clientApiMock.expects('requestTrumpf').once().withArgs(true).returns(Promise.resolve({
            mode: GameMode.OBEABE
        }));

        let cycle = {
            iterate: () => {
            }
        };

        let cycleMock = sinon.mock(cycle).expects('iterate').exactly(9).returns(Promise.resolve());
        cycleFactoryMock.expects('create').exactly(9).returns(cycle);


        game = Game.create(players, maxPoints, players[0], clientApi);

        game.start().then(() => {
            clientApiMock.verify();
            cycleFactoryMock.verify();
            cycleMock.verify();
            done();
        }).catch(done);

    });

    it('should save and broadcast the trumpf when it has been chosen from the player', (done) => {
        let gameMode = GameMode.TRUMPF;
        let cardColor = CardColor.HEARTS;
        let gameType = GameType.create(gameMode, cardColor);

        let cycle = {
            iterate: () => {
            }
        };

        let cycleMock = sinon.mock(cycle).expects('iterate').exactly(9).returns(Promise.resolve());
        cycleFactoryMock.expects('create').exactly(9).returns(cycle);

        clientApiMock.expects('requestTrumpf').once().returns(Promise.resolve(gameType));

        clientApiMock.expects('broadcastTrumpf').once();

        game = Game.create(players, maxPoints, players[0], clientApi);

        game.start().then(function () {
            expect(game.gameType.trumpfColor).to.equal(cardColor);
            expect(game.gameType.mode).to.equal(gameMode);
            clientApiMock.verify();
            cycleFactoryMock.verify();
            cycleMock.verify();
            done();
        }).catch(done);
    });

    it('should start with player who won last cycle', (done) => {
        let gameType = GameType.create(GameMode.TRUMPF, CardColor.CLUBS);

        let cycle = {
            iterate: () => {
            }
        };

        let cycleMock = sinon.mock(cycle).expects('iterate').exactly(9).returns(Promise.resolve(players[2]));
        cycleFactoryMock.expects('create').once().withArgs(players[0], players, clientApi, gameType).returns(cycle);
        cycleFactoryMock.expects('create').exactly(8).withArgs(players[2], players, clientApi, gameType).returns(cycle);

        clientApiMock.expects('requestTrumpf').once().returns(Promise.resolve(gameType));

        game = Game.create(players, maxPoints, players[0], clientApi);

        game.start().then(function () {
            clientApiMock.verify();
            cycleFactoryMock.verify();
            cycleMock.verify();
            done();
        }).catch(done);
    });

    afterEach(function () {
        clientApiMock.restore();
        cycleFactoryMock.restore();
    });

});


describe('checkWeise', () => {
    const makeCard = (num, color) => Card.create(num, CardColor[color]);

    let game;
    beforeEach(() => {
        // Vier Spieler, zwei Teams
        const players = [
            { id: 'p1', team: 'A', cards: [], score: 0, clientApi: {} },
            { id: 'p2', team: 'B', cards: [], score: 0, clientApi: {} },
            { id: 'p3', team: 'A', cards: [], score: 0, clientApi: {} },
            { id: 'p4', team: 'B', cards: [], score: 0, clientApi: {} }
        ];
        game = game.create({ mode: 'TRUMPF', trumpfColor: 'DIAMONDS' }, players, null);
        logger.info('logging gaaame')
        logger.info(game)
        // Stub clientApi.notifyWeise
    });

    it('should detect a 3-card sequence and award 20 points', () => {
        // p1 has 9,10,11 of clubs (non-trump)
        game.players[0].cards = [
            makeCard(9,'CLUBS'), makeCard(10,'CLUBS'), makeCard(11,'CLUBS')
        ];
        game.checkWeise();
        expect(game.allWeiseMap.get('p1')).toHaveLength(1);
        expect(game.winningWeiseMap.get('p1')).toEqual([
            makeCard(9,'CLUBS'), makeCard(10,'CLUBS'), makeCard(11,'CLUBS')
        ]);
        expect(game.players[0].score).toBe(20);
    });

    it('should detect a stoeck in trumpf and award 20 points', () => {
        // p2 has Ober and Koenig of diamonds (trump)
        game.players[1].cards = [
            makeCard(12,'DIAMONDS'), makeCard(13,'DIAMONDS')
        ];
        game.checkWeise();
        expect(game.winningWeiseMap.get('p2')).toEqual([
            makeCard(12,'DIAMONDS'), makeCard(13,'DIAMONDS')
        ]);
        expect(game.players[1].score).toBe(20);
    });

    it('should detect four-of-a-kind Under and award 200 points', () => {
        // p3 has four Under (Bauers) of all suits
        game.players[2].cards = [
            makeCard(11,'HEARTS'), makeCard(11,'DIAMONDS'), makeCard(11,'CLUBS'), makeCard(11,'SPADES')
        ];
        game.checkWeise();
        expect(game.winningWeiseMap.get('p3')).toHaveLength(4);
        expect(game.players[2].score).toBe(200);
    });

    it('should handle tie and throw error when undecided', () => {
        // p1 and p3 both have same 3-card sequence
        const seq = [makeCard(7,'SPADES'), makeCard(8,'SPADES'), makeCard(9,'SPADES')];
        game.players[0].cards = seq;
        game.players[2].cards = seq;
        expect(() => game.checkWeise()).toThrow(/Mehrere unentschiedene Sieger/);
    });
});
