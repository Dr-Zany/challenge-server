import {Logger} from "../../server/logger";


const Card = {
    equals: function (otherCard) {
        return this.number === otherCard.number && this.color === otherCard.color;
    }
};

export function create(number, color) {
    let card = Object.create(Card);
    card.number = number;
    card.color = color;
    return card;
}

export function createFromObject(card) {
    Logger.info('cfreating card')
    Logger.info(card)
    return create(card.number, card.color);
}