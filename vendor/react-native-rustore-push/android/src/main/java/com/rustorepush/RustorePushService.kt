package com.rustorepush

import android.os.Handler
import android.os.Looper
import android.util.Log
import com.rustorepush.utils.RuStorePushEmitter
import ru.rustore.sdk.pushclient.messaging.exception.RuStorePushClientException
import ru.rustore.sdk.pushclient.messaging.model.RemoteMessage
import ru.rustore.sdk.pushclient.messaging.service.RuStoreMessagingService

class RustorePushService : RuStoreMessagingService() {

  companion object {
    val messages = mutableMapOf<String, RemoteMessage>()
    var emitter: RuStorePushEmitter? = null
  }

  private val uiThreadHandler: Handler = Handler(Looper.getMainLooper())

  override fun onNewToken(token: String) {
    uiThreadHandler.post {
      emitter?.onNewToken(token)
    }
  }

  override fun onMessageReceived(message: RemoteMessage) {
    message.messageId?.let {
      messages[it] = message
    }
    uiThreadHandler.post {
      emitter?.onMessageReceived(message)
    }
  }

  override fun onDeletedMessages() {
    uiThreadHandler.post {
      emitter?.onDeletedMessages()
    }
  }

  override fun onError(errors: List<RuStorePushClientException>) {
    uiThreadHandler.post {
      emitter?.onError(errors.toString())
    }
  }
}
