import React from 'react';
import * as Card from '../../../shared/deck/card';
import { Logger } from '../../../server/logger';

export default class WiisNotification extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            secondsRemaining: 10
        };
    }

    componentDidMount() {
        // start countdown
        this.countdownTimer = setInterval(() => {
            this.setState(({ secondsRemaining }) => {
                if (secondsRemaining <= 1) {
                    clearInterval(this.countdownTimer);
                    return { secondsRemaining: 0 };
                }
                return { secondsRemaining: secondsRemaining - 1 };
            });
        }, 1000);
    }

    componentWillUnmount() {
        clearInterval(this.countdownTimer);
    }

    render() {
        const {
            players,
            allWeise = {},
            winningWeise = {},
            cardType,
        } = this.props;

        const { secondsRemaining } = this.state;

        const winEntries = Object.entries(winningWeise);
        if (winEntries.length === 0) return null;

        const [winnerId, winnerCards] = winEntries[0];
        const winner = players.find(p => p.id === winnerId) || { name: 'Unknown' };

        Logger.info(`Showing Wiis for ${winner.name} (${winnerId})`);

        return (
            <div id="wiisNotification">
                <div className="wiis-modal">
                    <div className="wiis-countdown">
                        {secondsRemaining}
                    </div>
                    <div className="wiis-title">
                        <h3>Wiis! {winner.name} kann weisen!</h3>
                    </div>
                    <div className="wiis-body">

                        <h4>Alle Weise:</h4>
                        {players.map(player => {
                            const runs = allWeise[player.id] || [];
                            if (runs.length === 0) {
                                return (
                                    <div key={player.id}>
                                        <strong>{player.name}</strong> – kein Weis
                                    </div>
                                );
                            }

                            return (
                                <div key={player.id}>
                                    <strong>{player.name}</strong>:
                                    {runs.map((cards, i) => {
                                        const isWinnerRun =
                                            player.id === winnerId &&
                                            cards.length === winnerCards.length &&
                                            cards.every((c, idx) =>
                                                c.number === winnerCards[idx].number &&
                                                c.color  === winnerCards[idx].color
                                            );

                                        return (
                                            <div
                                                key={i}
                                                className={`wiis-run${isWinnerRun ? ' highlight' : ''}`}
                                            >
                                                {cards.map(c => (
                                                    <img
                                                        key={`${c.color}-${c.number}`}
                                                        src={`/images/cards/${cardType}/${c.color.toLowerCase()}_${c.number}.gif`}
                                                        alt={Card.createFromObject(c).toString()}
                                                        className="wiis-card"
                                                    />
                                                ))}
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}

                        <h4>Höchster Weis:</h4>
                        <div className="wiis-winner-run">
                            {winnerCards.map(c => (
                                <img
                                    key={`${c.color}-${c.number}`}
                                    src={`/images/cards/${cardType}/${c.color.toLowerCase()}_${c.number}.gif`}
                                    alt={Card.createFromObject(c).toString()}
                                    className="wiis-card winner"
                                />
                            ))}
                        </div>

                    </div>
                </div>
            </div>
        );
    }
}
