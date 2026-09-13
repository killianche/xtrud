package com.rustorepush.utils

import ru.rustore.sdk.pushclient.messaging.model.RemoteMessage

interface RuStorePushEmitter {

   fun onNewToken(token: String)

   fun onMessageReceived(message: RemoteMessage)

   fun onDeletedMessages()

   fun onError(errors: String)
}
