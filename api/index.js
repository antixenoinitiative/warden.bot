module.exports = {
    Response: (data) => {
        return (
        {  
            header: {
                timestamp: `${new Date().toISOString()}`,
                softwareName: 'AXI Sentry API',
                softwareVersion: '1.0',
            },
            message: {
                rows: data,
            }
        })
    },
}