import React from 'react';
import { default as GameStore, GameState, PlayerType } from './gameStore';
import CardTypeSwitcher from './cardTypeSwitcher.jsx';
import PlayerCards from './playerCards.jsx';
import RequestTrumpf from './requestTrumpf.jsx';
import JassCarpet from './jassCarpet.jsx';
import Points from './points.jsx';
import SpectatorControls from './spectatorControls.jsx';
import WinnerNotification from './winnerNotification.jsx';
import WiisNotification from './wiisNotification.jsx';

export default React.createClass({
    // when the store changes, copy its state into component state
    handleGameSetupState() {
        this.setState(GameStore.state);
    },

    // invoked by the WiisNotification “Continue” button


    componentDidMount() {
        GameStore.addChangeListener(this.handleGameSetupState);
    },

    componentWillUnmount() {
        GameStore.removeChangeListener(this.handleGameSetupState);
    },

    render() {
        const state = this.state || GameStore.state;
        const {
            players = [],
            playerSeating,
            playerCards,
            tableCards = [],
            teams = [],
            status
        } = state;

        return (
            <div id="jassTable">
                <CardTypeSwitcher cardType={state.cardType} />

                <JassCarpet
                    cardType={state.cardType}
                    players={players}
                    playerSeating={playerSeating}
                    cards={tableCards}
                    startingPlayerIndex={state.startingPlayerIndex}
                    nextStartingPlayerIndex={state.nextStartingPlayerIndex}
                    mode={state.mode}
                    color={state.color}
                    roundPlayerIndex={state.roundPlayerIndex}
                    collectStich={state.collectStich}
                    chosenSession={state.chosenSession}
                    lastStichCards={state.lastStichCards}
                    lastStichStartingPlayerIndex={state.lastStichStartingPlayerIndex}
                    showLastStich={state.showLastStich}
                    status={status}
                />

                <Points teams={teams} showPoints={state.showPoints} />

                {state.playerType === PlayerType.PLAYER && (
                    <PlayerCards
                        cards={playerCards}
                        cardType={state.cardType}
                        state={status}
                        tableCards={state.tableCards}
                        mode={state.mode}
                        color={state.color}
                    />
                )}

                {status === GameState.REQUESTING_TRUMPF && (
                    <RequestTrumpf
                        isGeschoben={state.isGeschoben}
                        cardType={state.cardType}
                    />
                )}

                {state.playerType === PlayerType.SPECTATOR && <SpectatorControls />}

                {/* Wiis‐Notification */}
                {status === GameState.BROADCAST_WIIS && (
                    <WiisNotification
                        players={players}
                        allWeise={state.BROADCAST_WIIS.allWeise}
                        winningWeise={state.BROADCAST_WIIS.winningWeise}
                        cardType={state.cardType}
                    />
                )}

                {/* Winner‐Notification */}
                {status === GameState.FINISHED && (
                    <WinnerNotification teams={teams} />
                )}
            </div>
        );
    }
});
