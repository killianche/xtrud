package com.rustorepush

import android.content.Intent
import android.util.Log
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.WritableNativeMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.rustorepush.utils.DataMapper.deconstructReadableMap
import com.rustorepush.utils.DataMapper.remoteMessageToWritableMap
import com.rustorepush.utils.PushEvents
import com.rustorepush.utils.RuStorePushEmitter
import ru.rustore.sdk.core.exception.RuStoreException
import ru.rustore.sdk.core.feature.model.FeatureAvailabilityResult
import ru.rustore.sdk.pushclient.RuStorePushClient
import ru.rustore.sdk.pushclient.messaging.model.RemoteMessage
import ru.rustore.sdk.pushclient.messaging.model.TestNotificationPayload
import ru.rustore.sdk.pushclient.utils.resolveForPush

class RustorePushModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    private var allowNativeErrorHandling = true
    private const val TAG = "RustorePushModule"
    private const val MESSAGE_ID = "vkpns.analytics_payload.message_id"
  }

  override fun getName(): String {
    return "RustorePush"
  }

  private val activityEventListener: ActivityEventListener = object : BaseActivityEventListener() {
    // xtrud: в React Native 0.77+ onNewIntent принимает Intent без null.
    override fun onNewIntent(intent: Intent) {
      super.onNewIntent(intent)
      Log.i(TAG, "onNewIntent")
      val messageId = getMessageIdFromIntent(intent) ?: return
      Log.i(TAG, "messageId: $messageId")
      val message = RustorePushService.messages[messageId] ?: return
      Log.i(TAG, "message: $message")
      sendEvent(reactContext, PushEvents.ON_OPENED.name, remoteMessageToWritableMap(message))
      }
  }

  @ReactMethod
  fun getInitialNotification(promise: Promise) {
    Log.i(TAG, "getInitialNotification")
    val messageId = getMessageIdFromIntent(reactContext.currentActivity?.intent)
    Log.i(TAG, "messageId: $messageId")
    val message = RustorePushService.messages[messageId]
    Log.i(TAG, "message: $message")
    promise.resolve(if (message != null) remoteMessageToWritableMap(message) else null)
  }

  @ReactMethod
  fun checkPushAvailability(promise: Promise) {
    RuStorePushClient.checkPushAvailability()
      .addOnSuccessListener { result ->
        when (result) {
          is FeatureAvailabilityResult.Available -> {
            promise.resolve(true)
          }

          is FeatureAvailabilityResult.Unavailable -> {
            handleNativeError(result.cause)
            promise.resolve(result.cause.message)
          }
        }
      }
      .addOnFailureListener { throwable ->
        promise.reject(throwable)
      }
  }

  @ReactMethod
  fun getToken(promise: Promise) {
    RuStorePushClient.getToken()
      .addOnSuccessListener { token ->
        promise.resolve(token)
      }
      .addOnFailureListener { throwable ->
        promise.reject(throwable)
      }
  }

  @ReactMethod
  fun deleteToken(promise: Promise) {
    RuStorePushClient.deleteToken()
      .addOnSuccessListener {
        promise.resolve(true)
      }
      .addOnFailureListener { throwable ->
        promise.reject(throwable)
      }
  }

  @ReactMethod
  fun subscribeToTopic(topic: String, promise: Promise) {
    RuStorePushClient.subscribeToTopic(topic)
      .addOnSuccessListener {
        promise.resolve(true)
      }
      .addOnFailureListener { throwable ->
        promise.reject(throwable)
      }
  }

  @ReactMethod
  fun unsubscribeFromTopic(topic: String, promise: Promise) {
    RuStorePushClient.unsubscribeFromTopic(topic)
      .addOnSuccessListener {
        promise.resolve(true)
      }
      .addOnFailureListener { throwable ->
        promise.reject(throwable)
      }
  }

  @ReactMethod
  fun createPushEmitter() {
    reactContext.addActivityEventListener(activityEventListener)

    RustorePushService.emitter = object : RuStorePushEmitter {

      override fun onNewToken(token: String) {
        val params = WritableNativeMap().apply {
          putString("token", token)
        }
        sendEvent(reactApplicationContext, PushEvents.ON_NEW_TOKEN.name, params)
      }

      override fun onMessageReceived(message: RemoteMessage) {
        val notification = remoteMessageToWritableMap(message)
        sendEvent(reactContext, PushEvents.ON_MESSAGE_RECEIVED.name, notification)
      }

      override fun onDeletedMessages() {
        val params = WritableNativeMap().apply {
          putString("callback", "onDeletedMessages")
        }
        sendEvent(reactApplicationContext, PushEvents.ON_DELETED_MESSAGES.name, params)
      }

      override fun onError(errors: String) {
        val params = WritableNativeMap().apply {
          putString("errors", errors)
        }
        sendEvent(reactApplicationContext, PushEvents.ON_ERROR.name, params)
      }
    }
  }

  @ReactMethod
  fun deletePushEmitter() {
    RustorePushService.emitter = null
    reactContext.removeActivityEventListener(activityEventListener)
  }

  @ReactMethod
  fun offNativeErrorHandling() {
    allowNativeErrorHandling = false
  }

  @ReactMethod
  fun sendTestNotification(params: ReadableMap, promise: Promise) {
    val title = params.getString("title").orEmpty()
    val body = params.getString("body").orEmpty()
    val imgUrl = params.getString("imageUrl").orEmpty()
    val data = deconstructReadableMap(params.getMap("data"))

    RuStorePushClient.sendTestNotification(TestNotificationPayload(title, body, imgUrl, data))
      .addOnSuccessListener {
        promise.resolve(true)
      }
      .addOnFailureListener { throwable ->
        promise.reject(throwable)
      }
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Keep: Required for RN built in Event Emitter Calls.
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // Keep: Required for RN built in Event Emitter Calls.
  }


  private fun handleNativeError(throwable: Throwable) {
    if (allowNativeErrorHandling && throwable is RuStoreException)
      reactApplicationContext.currentActivity?.let { throwable.resolveForPush(it) }
  }

  private fun sendEvent(reactContext: ReactContext, eventName: String, params: WritableMap?) {
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, params)
  }

  private fun getMessageIdFromIntent(intent: Intent?) : String? {
    return intent?.extras?.getString(MESSAGE_ID)
  }
}
