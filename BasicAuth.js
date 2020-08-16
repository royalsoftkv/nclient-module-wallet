var BasicAuthentication;

BasicAuthentication = class BasicAuthentication {
    constructor(username, password) {
        this.username = username;
        this.password = password;
    }

    sign(options, request) {
        return options.auth = `${this.username}:${this.password}`;
    }

};

module.exports = BasicAuthentication;
