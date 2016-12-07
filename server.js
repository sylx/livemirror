var express = require('express'),
    http = require('http'),
    app = express(),
    WebSocketServer = require('websocket').server,
    log4js = require('log4js'),
    logger = log4js.getLogger(),
    server = http.createServer(app);

app.use(/\/[a-z0-9]+/,express.static(__dirname + '/public'));

var wsServer = new WebSocketServer({
    httpServer: server,
    autoAcceptConnections: false
});


var channel={};

wsServer.on('request', function(request) {
    logger.info('Connection to '+request.resource);
    var m=request.resource.match(/\/([a-z0-9]+)\/(master|slave)/);
    var chan=null,
        is_master=false,
        connection=null,
        channel_name="";
    if(m){
        channel_name=m[1];
        if(!channel[channel_name]){
            channel[channel_name]={
                name: m[1],
                buffers: [],
                currentBuffer: null,
                slave: []
            };
        }
        if(m[2] === "master"){
            if(channel[channel_name]['master']){
                request.reject();
                logger.warn('Connection refused. Already master connected. '+request.resource);
                return;
            }
            connection = request.accept();
            channel[channel_name]['master']=connection;
            is_master=true;
            logger.info('Connection accepted as master. '+request.resource);
        }else{
            connection = request.accept();
            channel[channel_name]['slave'].push(connection);
            logger.info('Connection accepted as slave(%d). %s',
                        channel[channel_name].slave.length,request.resource);
            on_slave_connect(connection,channel[channel_name]);
        }
    }else{
        request.reject();
        logger.warn('Connection refused. url is invalid. '+request.resource);
        return;
    }

    connection.on('message', function(message) {
        if (message.type === 'utf8') {
            on_message(message);
        }
    });

    connection.on('close', function(reasonCode, description) {
        logger.info('Peer ' + connection.remoteAddress + ' disconnected.');
        if(is_master){
            channel[channel_name].master=null;
            broadcast_slave({
                type: "master_disconnect",
                description: description
            },channel[channel_name]);
        }else{
            channel[channel_name].slave.splice(
                channel[channel_name].slave.indexOf(connection),
                1);
        }
    });

    function on_message(message){
        if(is_master){
            try{
                var data=JSON.parse(message.utf8Data);
                switch(data.type){
                case "buffer":
                    on_buffer(data,channel[channel_name]);
                    break;
                case "chunk":
                    on_chunk(data,channel[channel_name]);
                    break;
                default:
                    broadcast_slave(data,channel[channel_name]);
                    break;
                }
            }catch(e){
                logger.error('Peer ' + connection.remoteAddress + ' error:'+e);
            }
        }else{
            //nop
        }
    }

    function on_buffer(data,chan){
        var buf=data;
        if(!data.text) data.text="";
        chan.buffers[data.name]=buf;
        chan.currentBuffer=buf;
    }
    function on_chunk(data,chan){
        var buf=chan.buffers[data.name];
        buf.text+=data.text;
        if(data.text.length === 0){
            broadcast_slave({
                type: "text",
                mode: buf.mode,
                name: buf.name,
                text: buf.text
            },chan);
        }
    }
    
    function on_slave_connect(conn,chan){
        var buf=chan.currentBuffer;
        if(!buf || !chan.master) return;
        conn.sendUTF(JSON.stringify({
            type: "text",
            mode: buf.mode,
            name: buf.name,
            text: buf.text
        }),chan);
    }
    function broadcast_slave(data,chan){
        logger.debug("broadcast slaves channel:%s event:%s",chan.name,data.type);
        chan.slave.forEach(function(conn){
            conn.sendUTF(JSON.stringify(data));
        });
    }
});

server.listen(11072);
logger.info('Server is listening on port 11072');

