package com.rustorepush.utils

import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.WritableNativeArray
import com.facebook.react.bridge.WritableNativeMap
import ru.rustore.sdk.pushclient.messaging.model.RemoteMessage

object DataMapper {

  fun byteArrayToWritableArray(array: ByteArray?): WritableArray {
    val writableArray: WritableArray = WritableNativeArray()
    if (array != null) {
      for (i in array.indices) {
        writableArray.pushInt(array[i].toInt())
      }
    }
    return writableArray
  }

  fun mapToWritableMap(map: Map<String, String>): WritableMap {
    val result = WritableNativeMap()
    map.forEach { (key, value) ->
      result.putString(key, value)
    }
    return result
  }

   fun deconstructReadableMap(readableMap: ReadableMap?): Map<String, String> {
    val iterator = readableMap?.keySetIterator()
    val deconstructedMap: MutableMap<String, String> = mutableMapOf()
     if (iterator != null) {
       while (iterator.hasNextKey()) {
         val key = iterator.nextKey()
         deconstructedMap[key] = readableMap.getString(key)!!
       }
     }
    return deconstructedMap
  }

  fun remoteMessageToWritableMap(message: RemoteMessage): WritableMap {
    val notification = WritableNativeMap().apply {
      putString("title", message.notification?.title)
      putString("body", message.notification?.body)
      putString("channelId", message.notification?.channelId)
      putString("imageUrl", message.notification?.imageUrl.toString())
      putString("color", message.notification?.color)
      putString("icon", message.notification?.icon)
      putString("clickAction", message.notification?.clickAction)
      putString("clickActionType", message.notification?.clickActionType?.name)
      }
    val remoteMessage = WritableNativeMap().apply {
      putString("messageId", message.messageId)
      putInt("priority", message.priority)
      putInt("ttl", message.ttl)
      putString("from", message.from)
      putString("collapseKey", message.collapseKey)
      putMap("data", mapToWritableMap(message.data))
      putArray("rawData",byteArrayToWritableArray(message.rawData))
      putMap("notification", notification)
    }
    return remoteMessage
  }
}
