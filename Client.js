var BasicAuth, Client;

BasicAuth = require("./BasicAuth");

Client = class Client {
    constructor(url) {
        this.transport = (url.protocol != null) && url.protocol === "https" ? require("https") : require("http");
        this.host = url.host;
        this.port = url.port;
        this.path = url.path;
        this.onResponse = url.onResponse;
    }

    setAuth(auth) {
        this.auth = auth;
    }

    setBasicAuth(username, password) {
        return this.setAuth(new BasicAuth(username, password));
    }

    call(method, params, callback) {
        var options, query, request;
        request = {
            method: method,
            params: params
        };
        options = {
            host: this.host,
            port: this.port,
            method: "post",
            path: this.path,
            headers: {
                Host: this.host
            }
        };
        if (this.auth != null) {
            this.auth.sign(options, request);
        }
        query = JSON.stringify(request);
        options.headers['Content-Length'] = query.length;
        options.headers["Content-Type"] = "application/json";
        options.timeout = 3000;
        //    options.rejectUnauthorized = false
        request = this.transport.request(options);
        request.on("error", function(err) {
            return callback(err);
        });
        request.on("timeout", function(err) {
            // request.abort();
            return callback(err);
        });
        let _this = this;
        request.on("response", function(response) {
            var buffer;
            buffer = '';
            response.on('data', function(chunk) {
                return buffer += chunk;
            });
            return response.on('end', function() {
                var e, err, json, msg;
                err = msg = null;
                if (response.statusCode === 200) {
                    try {
                        if(typeof _this.onResponse === 'function') {
                            buffer = _this.onResponse(buffer);
                        }
                        json = JSON.parse(buffer);
                        if (json.error != null) {
                            err = json.err;
                        }
                        if (json.result) {
                            msg = json.result;
                        }
                    } catch (error) {
                        e = error;
                        err = e;
                    }
                } else {
                    err = "Server replied with : " + response.statusCode;
                    msg = buffer;
                }
                return callback(err, msg);
            });
        });
        return request.end(query);
    }

};

module.exports = Client;
