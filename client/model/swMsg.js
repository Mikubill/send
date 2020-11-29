export default (msg) => {
        return new Promise((resolve, reject) => {
            const channel = new MessageChannel();

            channel.port1.onmessage = (event) => {
                if (event.data === undefined) {
                    reject('bad response from serviceWorker');
                } else if (event.data.error !== undefined) {
                    console.log(event.data.error)
                    reject(event.data.error);
                } else {
                    // console.log(event.data)
                    resolve(event.data);
                }
            };

            navigator.serviceWorker.controller.postMessage(msg, [channel.port2]);
        });
    }