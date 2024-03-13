import {
  ConsumerDeserializer,
  ConsumerSerializer,
  ProducerDeserializer,
  ProducerSerializer,
} from '@nestjs/microservices';

export interface ProducerSerialization {
  serializer?: ProducerSerializer;
  deserializer?: ProducerDeserializer;
}

export interface ConsumerSerialization {
  deserializer?: ConsumerDeserializer;
  serializer?: ConsumerSerializer;
}
