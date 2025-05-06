FROM node:lts

# Create app directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# Install app dependencies
COPY package.json /usr/src/app/
RUN npm install --legacy-peer-deps

# Bundle app source
COPY . /usr/src/app

ENV TOURNAMENT_ROUNDS 5
ENV TOURNAMENT_COUNTING true

EXPOSE 3000
CMD [ "npm", "start" ]
